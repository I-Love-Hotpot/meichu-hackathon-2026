# MedAboutYou frontend

Responsive React implementation of the MedAboutYou keyboard-phone design for QVGA (240 × 320) and QQVGA (128 × 160).

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

The UI supports `zh-TW` and `en-US` through the existing i18next setup. Choose item `5` on the home screen to change language; the choice persists in `localStorage`.

See [DESIGN.md](./DESIGN.md) for the complete screen, token, interaction, component, and backend-handoff requirements.
