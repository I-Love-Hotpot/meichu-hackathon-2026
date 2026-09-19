# MedAboutYou frontend design specification

This frontend implements the MedAboutYou Figma design as a keyboard-first React app for a 240 × 320 Cloud Phone.

- Figma: [MedAboutYou — CloudPhone UI](https://www.figma.com/design/pMbjR2mH40HY4Xso6V2pzj/MedAboutYou-%25E2%2580%2594-CloudPhone-UI)
- UI guidelines: <https://www.cloudphone.tech/uiux-guidelines>
- Development guidelines: <https://www.cloudphone.tech/dev-guidelines>

## Screen anatomy

Every screen uses the same fixed layout so focus and soft-key positions never jump:

| Region | Height | Purpose |
| --- | ---: | --- |
| App header | 40 px | One centered page title, optional date/time |
| Content | 240 px | One primary task and one visible focus target |
| Soft-key bar | 40 px | Contextual LSK, center confirm, consistent RSK |

The page is exactly 240 × 320 px. The browser preview centers this surface without scaling; the target device fills its viewport exactly.

## Visual tokens

| Token | Value | Usage |
| --- | --- | --- |
| Ink | `#132A2F` | Main text and soft-key background |
| Screen | `#FAFCF7` | App canvas |
| Header | `#E7F3EE` | Header background |
| Focus fill | `#D6F1E7` | Current keyboard focus |
| Focus stroke | `#007C72` | 3 px current-focus outline |
| Divider | `#B9C9C5` | Default control border |
| Danger | `#B6382E` | Emergency and allergy information |
| Success | `#2B7653` | Completed state |

Typography uses `Noto Sans TC`, then platform Chinese sans-serif fallbacks. Titles are 24 px and bold; controls are 15–18 px. The UI is flat, high contrast, and does not depend on shadows or hover states.

## Interaction model

- `ArrowUp` / `ArrowDown`: move the single visible focus through a list.
- `ArrowLeft` / `ArrowRight`: choose a binary option or adjust a quantity.
- `Enter`: activate the focused item or confirm the current screen.
- `Escape` / `SoftLeft`: trigger the left soft-key action.
- Home numeric shortcuts: `1`–`4` open the matching menu item; `9` opens the reminder demo.
- Pointer clicks are supported for desktop development, but all primary flows work from the keypad.

The physical right soft key is not handled as a keyboard event. Every internal screen transition creates a native browser history entry with `history.pushState()`. RSK therefore invokes the platform's normal back action and the app restores the previous screen from `popstate`; only the root entry may be closed by the platform. The rendered right soft-key button calls the same `history.back()` path for desktop testing.

Destructive and emergency information uses both text and color; color is never the only cue.

## Implemented flows

1. Home → record today → toggle doses → completion feedback.
2. Home → history → daily detail → update record → quantity.
3. Home → medicines → medicine detail.
4. Medicines → add medicine → photo/file or keyboard input → recognition → confirm → daily-use decision → reminder → completion.
5. Home → emergency information.
6. Home `9` → reminder alert demo → record or postpone.

All current data is fixture data in `src/data/fixtures.js`. Today’s completion toggles persist in `localStorage` under `medaboutyou-today-doses`.

## Photo/file requirement

The upload screen intentionally uses only a native HTML file input:

```html
<input type="file" accept="image/*" capture="environment" />
```

On a supported phone this opens the system camera or image picker. After selection, the file enters the recognition flow directly. The app does not render a camera view or an image preview, which keeps the QVGA interface simple and avoids extra memory use.

The current recognition step is a 1.2 second frontend mock. When the backend contract is ready, replace that timer with a `multipart/form-data` upload and keep the same loading, confirm, error, and cancel states. Do not put the image into base64 or `localStorage`.

## Component map

- `DeviceShell`: fixed header/content/soft-key frame and keyboard event surface.
- `ListRow`: reusable menu/action row with focus, danger, and success states.
- `MedicineRow`: medicine identity, schedule, completion, and focus states.
- `Decision`: keyboard/pointer binary choice.
- `QuantityPicker`: half-unit quantity adjustment.
- `FeedbackCard`: success or emergency feedback.

Application state and screen transitions currently live in `src/App.jsx`. Components are intentionally presentational so a backend store or router can be introduced later without changing the visual system.
