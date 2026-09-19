# MedAboutYou frontend

React implementation of the MedAboutYou 240 × 320 keyboard-phone design.

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
- `←` / `→`: choose or adjust
- `Enter`: confirm
- `Escape`: left soft key
- `Backspace`: right soft key / back
- `1`–`4`: home shortcuts
- `9`: reminder demo

The photo flow uses the device's native camera or image picker via `<input type="file" accept="image/*" capture="environment">`; the selected image is not previewed in the app.

See [DESIGN.md](./DESIGN.md) for the complete screen, token, interaction, component, and backend-handoff requirements.
