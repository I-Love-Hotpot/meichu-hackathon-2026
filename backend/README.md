# CloudPhone Fastify Backend

This backend is a lightweight Fastify service designed to work with a CloudMosa CloudPhone widget web app.

## Quick start

1. Copy `.env.example` to `.env`.
2. Update the CloudPhone settings.
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

The OpenAPI document is stored at `backend/api-docs/swagger.json` and is exposed at `http://localhost:3001/api-docs/swagger.json` during local development.

## Environment variables

- `PORT`: server port, default `3001`
- `ALLOWED_ORIGINS`: allowed CORS origins, comma separated
- `TWILIO_ACCOUNT_SID`: Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Twilio Auth Token
- `TWILIO_FROM_NUMBER`: Twilio phone number used as the SMS sender, in E.164 format
- `ENABLE_TEST_SMS_ENDPOINT`: set to `true` to enable the temporary SMS test endpoint; default `false`

## Sending SMS from backend services

Import `sendSms` from `src/services/twilio.service.js` in any backend service:

```js
import { sendSms } from "./services/twilio.service.js";

const message = await sendSms({
	to: "+886912345678",
	body: "Your verification code is 123456",
});

console.log(message.sid);
```

`sendSms` sends plain text only and returns the Twilio message object. It throws a configuration error when the Twilio environment variables are missing and a validation error when `to` or `body` is empty.

## Temporary SMS test endpoint

Set `ENABLE_TEST_SMS_ENDPOINT=true`, restart the backend, and call:

```bash
curl -X POST http://localhost:3001/api/sms/test \
	-H 'Content-Type: application/json' \
	-d '{"to":"+886912345678","body":"This is a test SMS"}'
```

The endpoint is disabled by default and should not be enabled in production. It returns the Twilio message `sid` and status when the message is accepted.
