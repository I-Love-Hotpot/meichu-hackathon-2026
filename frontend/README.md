# MedAboutYou frontend

Responsive React implementation of the MedAboutYou keyboard-phone design for QVGA (240 × 320) and QQVGA (128 × 160).

## MedCompanion medicine chat

The home page searches `42_2.csv` and provides Gemini-powered questions about selected medicines. Users may ask in any language, but every answer, warning, and follow-up question is returned in American English (`en-US`). Google Cloud Translation converts Chinese CSV values to English on the backend. The CSV does not contain indications, adverse effects, or dosage. See [backend/README.md](../backend/README.md) for configuration.

For local development with Node.js 22, configure `backend/.env`, run `npm run dev` in `backend/`, then run `npm ci` and `npm run dev` in `frontend/`. Vite proxies `/api` to `http://localhost:3001`.

For Docker development, set `GEMINI_API_KEY` and `GOOGLE_TRANSLATE_API_KEY` in the repository-root `.env`, run `docker compose up --build -d`, and open `http://localhost:8081`. Leave `API_BASE_URL` empty to use the same-origin Nginx proxy.

For a separate API domain, set `API_BASE_URL=https://your-api.example.com` before building and allow the frontend origin in `ALLOWED_ORIGINS`. Keep Gemini and Google Translation keys only in the backend environment; never use a `VITE_` prefix.

The chat supports Enter to send, Shift+Enter for a new line, multiple turns, recognition text, and retries. Conversations stay only in page memory and clear on reload. Images are not uploaded.

Validation: `npm run lint` and `npm run build`.


## Run locally

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run build
```

## Controls

- `↑` / `↓`: move focus
- `←` / `→`: choose, adjust, or flip medicine-match cards
- `↑` / `↓` on a match card: scroll card details
- `Enter`: confirm
- `Escape`: left soft key
- `1`–`5`: home feature shortcuts
- `1`–`9`: select numbered items in supported lists
- Number keys: enter quantity directly; `*` enters a decimal point
- `9`: reminder demo

The physical right soft key uses native browser history rather than a keyboard listener. Internal transitions call `history.pushState()`, so RSK returns to the preceding app screen instead of closing the app.

The photo flow uses the device's native camera or image picker via `<input type="file" accept="image/*" capture="environment">`; the selected image is not previewed in the app.

The UI is fixed to American English (`en-US`). Home item `5` opens Medicine Q&A; users may ask in any language, while responses remain in American English.

Both manual entry routes use the same required name and optional Directions form. Manual entry selected from Add medicine continues to recognition/query and the result cards; manual entry selected from the final result card stores the values directly without another query.

Directions and reminder times can be edited for both fixture and manually entered medicines. Reminder screens combine every time used by active medicines into reusable choices and add an `n + 1` Other time action. Medicines can also be archived, restored, or deleted from their detail screen. Completed flows clear intermediate history so Back returns to Home.

The UI supports `zh-TW` and `en-US` through the existing i18next setup. Choose item `5` on the home screen to change language; the choice persists in `localStorage`.

See [DESIGN.md](./DESIGN.md) for the complete screen, token, interaction, component, and backend-handoff requirements.
