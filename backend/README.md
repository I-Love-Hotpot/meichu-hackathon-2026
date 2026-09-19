# CloudPhone Fastify Backend

This backend is a lightweight Fastify service designed to work with a CloudMosa CloudPhone widget web app.

## Quick start

Requires Node.js 22 or newer (matching the Docker images).

1. From `backend/`, copy `.env.example` to `.env`.
2. Update the CloudPhone and Gemini settings. Docker Compose reads the repository-root `.env`; local `npm run dev` reads `backend/.env`.
3. Install dependencies:

```bash
npm install
```

4. Run in development mode:

```bash
npm run dev
```

5. Start the production server:

```bash
npm start
```

## Main routes

- `GET /health`
- `GET /api-docs/swagger.json`
- `POST /api/sms/test` (temporary, disabled by default)
- `GET /api/medicine?license_number=許可證字號` (look up one medicine in MariaDB)
- `GET /api/medicine/search?q=medicine-name` (CSV medicine search and English translation)
- `POST /api/medicine/recognize` (raw JPEG/PNG/WebP evidence extraction and deterministic CSV matching)
- `POST /api/medicine/chat` (Gemini medicine assistant)

The OpenAPI document is stored at `backend/api-docs/swagger.json` and is exposed at `http://localhost:3001/api-docs/swagger.json` during local development.
The interactive Swagger UI is available at `http://localhost:3001/api-docs`.

## Environment variables

- `PORT`: server port, default `3001`
- `ALLOWED_ORIGINS`: allowed CORS origins, comma separated
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE`: MariaDB connection for the license lookup API. Defaults are `127.0.0.1`, `3306`, `root`, empty password, and `backend`. Development Compose supplies `dev-db:3306` and reads credentials from the root `.env`. For a production backend, configure the same variables in its deployment environment.
- `TWILIO_ACCOUNT_SID`: Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Twilio Auth Token
- `TWILIO_FROM_NUMBER`: Twilio phone number used as the SMS sender, in E.164 format
- `ENABLE_TEST_SMS_ENDPOINT`: set to `true` to enable the temporary SMS test endpoint; default `false`
- `GEMINI_API_KEY`: server-only Gemini API key used by medicine chat and image evidence extraction. A missing key returns HTTP 503 for image recognition and when chat resolves one medicine. Search and candidate clarification do not require a key.
- `GEMINI_MODEL`: Gemini model ID supporting structured output; default `gemini-3.5-flash`. Set this to a model enabled for your API key.
- `GEMINI_TIMEOUT_MS`: provider deadline in milliseconds, from `1000` to `120000`; default `30000`
- `GEMINI_SYSTEM_PROMPT`: assistant identity, quoted as a single line in `.env`; the mandatory safety instructions still require every response to use American English (`en-US`), regardless of input language.
- `GOOGLE_TRANSLATE_API_KEY`: server-only Google Cloud API key with Cloud Translation API enabled. Required when matched CSV fields contain Chinese text.
- `GOOGLE_TRANSLATE_TIMEOUT_MS`: Translation API deadline from `1000` to `120000`; default `15000`.
- `MEDICINE_CSV_PATH`: optional CSV path (relative paths resolve from the server working directory); empty uses `backend/resources/42_2.csv`. Invalid or unreadable files return HTTP 503, without falling back to model memory.

## Look up a medicine by license number

`GET /api/medicine` queries the `medicines` database table using the complete `license_number`. It returns the original stored values, with no translation or Gemini request. Leading and trailing whitespace in the query is ignored. If duplicate license identifiers exist, the row with the lowest `id` is returned.

```bash
curl --get http://localhost:3001/api/medicine \
  --data-urlencode 'license_number=內衛成製字第000386號'
```

```json
{
  "ok": true,
  "medicine": {
    "id": 2,
    "license_number": "內衛成製字第000386號",
    "chinese_name": "建功丸",
    "english_name": "CHENG KONG PILL",
    "shape": "其他",
    "color": "棕",
    "score_line": "無",
    "size": "8",
    "imprint_1": "",
    "imprint_2": "",
    "image_url": "https://mcp.fda.gov.tw/insert/shapeImg/89db57ae-5c85-47b8-9d74-351ecad719e6?c=o"
  }
}
```

`id` is the database record number; `score_line` is the pill's score line (切線／刻痕). Missing values remain empty strings or `null`, as stored in MariaDB. `size` remains a string with no assumed unit. Multiple values or image links retain the source's `;;;` separator.

Errors use `{ "ok": false, "error": "message" }`: 400 for a missing, blank, repeated, or oversized license number (maximum 255 characters), or unexpected query parameters; 404 for no matching record; 503 for database connection/query failures. No database credentials or SQL details are returned.

Development Compose connects the backend to the database through its internal network. The development database port is not published to the host; run the backend through Compose, or configure `DB_HOST`/`DB_PORT` for a database reachable from your local process. The existing search/chat endpoints still use the CSV described below.

## Medicine questions and CSV source

The data comes from `data/db/42_2.csv` and contains 6,318 records. An identical deployment copy is stored at `backend/resources/42_2.csv`, so local and Docker builds do not need to access the MariaDB data directory.

After updating the source CSV, run this from `backend/`:

```bash
npm run sync:medicines
```

This validates the source and refreshes the deployment copy. The backend reloads changed files; rebuild the image for production Docker. To read the source file directly during local development, set `MEDICINE_CSV_PATH=../data/db/42_2.csv` in `backend/.env`. A container needs an explicit file mount when this override is used.

The CSV provides license identifiers, Chinese and English names, shape, color, score lines, appearance size, imprints, and image links. It does **not** provide indications, ingredient details, adverse effects, interactions, or dosage. Empty values mean “not provided,” and the size field has no stated unit.

## Recognize visible medicine evidence from an image

`POST /api/medicine/recognize` accepts the image bytes directly, not JSON,
base64, or `multipart/form-data`. Set `Content-Type` to `image/jpeg`,
`image/png`, or `image/webp`; the maximum body size is 5 MiB. The declared
content type must match the file signature.

```bash
curl http://localhost:3001/api/medicine/recognize \
  -H 'Content-Type: image/jpeg' \
  --data-binary '@medicine.jpg'
```

Gemini is used only as a constrained visual transcription step. It may return
visible OCR text, medicine-name and strength strings, and directly legible pill
imprints. It is explicitly instructed not to identify a medicine from appearance
or model knowledge. The backend then performs deterministic matching against
`42_2.csv`: visible names take priority, followed by OCR text. If only pill
appearance is available, matching is disabled unless an imprint is legible; an
imprint candidate must exactly match a normalized CSV imprint. Color and shape
alone never select a medicine. A structured medicine name is ignored unless it
also appears in the returned visible OCR text, preventing an appearance-based
model guess from becoming a catalog query.

The response includes the unverified `recognition` evidence, `matchStrategy`, and
up to eight translated `MedicineRecord` objects in `records`. Preserve each
record's opaque `recordId` when sending `selectedMedicineId` to medicine chat;
do not use the translated `licenseNumber` display value as an ID. A successful
request may return an empty `records` array when no deterministic match exists.

The image is sent to the configured Gemini API. Matched Chinese CSV fields are
sent to Google Cloud Translation before records are returned. The backend does
not persist the image or recognition result.

Enable Cloud Translation API in Google Cloud, create an API key restricted to that API, and add both server-side keys to `.env`. Never use a `VITE_` prefix for either key. Docker Compose reads the repository-root `.env`; local `npm run dev` reads `backend/.env`.

```dotenv
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-3.5-flash
GEMINI_TIMEOUT_MS=30000
GEMINI_SYSTEM_PROMPT="You are the MedCompanion medicine data assistant. Understand questions in any language, but always answer in clear American English (en-US) using only the CSV fields supplied by the backend."
GOOGLE_TRANSLATE_API_KEY=your-google-cloud-translation-key
GOOGLE_TRANSLATE_TIMEOUT_MS=15000
MEDICINE_CSV_PATH=
```

The chat accepts questions in any language, but Gemini must always return `answer`, `warnings`, and `followUpQuestions` in American English (`en-US`). After selecting a record, users can ask questions such as “What color is it?” or its equivalent in another language. The selected record remains attached to follow-up questions until the chat is cleared.

Search does not call Gemini, but it uses Google Cloud Translation to convert Chinese values such as color, shape, license text, and score-line information into English. Results are cached in memory. Search supports case-insensitive and partial names and returns up to eight records.

```bash
curl --get http://localhost:3001/api/medicine/search \
  --data-urlencode 'q=CHENG KONG PILL'

curl http://localhost:3001/api/medicine/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "What are its shape, color, and score line?",
    "selectedMedicineId": "med_5YWn6KGb5oiQ6KO95a2X56ysMDAwMzg26Jmf",
    "history": []
  }'
```

Use the search result’s opaque `recordId` as `selectedMedicineId`. The backend reloads the source record and does not trust client-supplied medicine fields. `licenseNumber` is the translated display value. Without an ID, the backend matches the current question or recognition text.

For a single match, Google Cloud Translation converts Chinese source values to English before the record is sent to Gemini or the browser. Multiple candidates return `catalog.status=ambiguous`; no match returns `not_found`. Those paths do not call Gemini. Responses include English `sources` and catalog metadata. Image links are shown to users but images are not sent to Gemini.

`message` is required and limited to 2,000 characters. `history` accepts up to 10 complete user/assistant pairs, each limited to 8,000 characters. `recognition` may contain text or up to 10 candidate medicines; confidence does not verify pill identity. Swagger at `/api-docs` contains the complete contract.

Errors use `{ "ok": false, "error": "message" }`: 400 invalid input, 404 unknown selected ID, 413 oversized request, 415 unsupported content type, 422 safety refusal, 429 provider quota/rate limit, 502 provider or response error, 503 missing/invalid CSV or provider configuration, and 504 timeout.

Translation uses the official [Cloud Translation Basic v2 REST method](https://cloud.google.com/translate/docs/reference/rest/v2/translate) with `source=zh-TW`, `target=en`, and `format=text`. Gemini uses the generateContent REST API. Questions, history, recognition data, and the matched English record are sent to Gemini. Chinese source fields are sent to Google Cloud Translation. This is appearance-data lookup, not pill verification or prescribing advice.

## Tests

```bash
npm test
```

Tests mock the database, Gemini, and Google Cloud Translation, require no database or API keys, and consume no quota. They cover license lookup, parameterized SQL, connection cleanup, CSV parsing, all-record loading, search, image content types and limits, visible-evidence extraction, deterministic name/text/imprint matching, the no-imprint safety rule, candidate selection, follow-ups, translation batching/caching/errors, provider failures, Swagger, and UI contracts.

## Sending SMS from backend services

Import `sendSms` from `src/services/twilio.service.js` in any backend service:

```js
import { sendSms } from "./services/twilio.service.js";

const message = await sendSms({ to: "+886912345678" });

console.log(message.sid);
```

The Twilio account currently in use is a **trial account**, which can only send SMS using a predefined template as the message body (`sms_appointment_reminders`); any other free-form text is rejected with `Invalid template name.`. `sendSms` therefore defaults `body` to that template and callers should not override it until the account is upgraded. `sendSms` returns the Twilio message object and throws a configuration error when the Twilio environment variables are missing and a validation error when `to` is empty.

## Temporary SMS test endpoint

Set `ENABLE_TEST_SMS_ENDPOINT=true`, restart the backend, and call:

```bash
curl -X POST http://localhost:3001/api/sms/test \
	-H 'Content-Type: application/json' \
	-d '{"to":"+886912345678"}'
```

The endpoint always sends the predefined `sms_appointment_reminders` template body (trial account restriction) and does not accept a custom `body`. It is disabled by default and should not be enabled in production. It returns the Twilio message `sid` and status when the message is accepted.
