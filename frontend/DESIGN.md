# MedAboutYou frontend design specification

This frontend implements the MedAboutYou Figma design as a keyboard-first React app for both QVGA and QQVGA Cloud Phones.

- Figma: [MedAboutYou — CloudPhone UI](https://www.figma.com/design/pMbjR2mH40HY4Xso6V2pzj/MedAboutYou-%25E2%2580%2594-CloudPhone-UI)
- UI guidelines: <https://www.cloudphone.tech/uiux-guidelines>
- Development guidelines: <https://www.cloudphone.tech/dev-guidelines>

## Screen anatomy

Every screen uses the same fixed layout so focus and soft-key positions never jump:

| Region | QVGA 240×320 | QQVGA 128×160 | Purpose |
| --- | ---: | ---: | --- |
| App header | 40 px | 26 px | One centered page title, optional date/time |
| Content | 240 px | 106 px | One primary task and one visible focus target |
| Soft-key bar | 40 px | 28 px | Contextual LSK, center confirm, consistent RSK |

The app uses native CSS layout at both 240 × 320 and 128 × 160; it does not scale a QVGA screenshot down. QQVGA uses smaller type, two-pixel focus borders, compact rows, and hides secondary helper copy while preserving the active task and all keypad actions.

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

Typography uses `Noto Sans TC`, then platform Chinese sans-serif fallbacks. QVGA titles are 24 px with 15–18 px controls; QQVGA titles are 14 px with 8–13 px controls. The UI is flat, high contrast, and does not depend on shadows or hover states.

## Interaction model

- `ArrowUp` / `ArrowDown`: move the single visible focus through a list.
- `ArrowLeft` / `ArrowRight`: choose a binary option or adjust a quantity.
- `Enter`: activate the focused item or confirm the current screen.
- `Escape` / `SoftLeft`: trigger the left soft-key action.
- Home numeric shortcuts: `1`–`5` open the matching function; `9` opens the reminder demo.
- Numbered menus accept `1`–`9` for direct selection without moving focus first.
- Quantity controls accept direct numeric entry. Press `*` for the decimal point, so `1`, `*`, `5` enters `1.5` pills.
- Pointer clicks are supported for desktop development, but all primary flows work from the keypad.

The physical right soft key is not handled as a keyboard event. Every internal screen transition creates a native browser history entry with `history.pushState()`. RSK therefore invokes the platform's normal back action and the app restores the previous screen from `popstate`; only the root entry may be closed by the platform. Completed flows collapse their intermediate history before showing feedback, so RSK returns to Home instead of reopening the completed flow. The rendered right soft-key button calls the same `history.back()` path for desktop testing.

Destructive and emergency information uses both text and color; color is never the only cue.

## Implemented flows

1. Home → record today → toggle doses → completion feedback.
2. Home → history → daily detail → update record → quantity.
3. Home → medicines → medicine detail → edit directions/reminders, archive/unarchive, or delete.
4. Medicines → add medicine → photo/file → recognition → possible medicine matches. Selecting a result continues through daily-use and reminders; selecting the final manual card stores its name and optional directions directly.
5. Medicines → add medicine → manual name and optional directions → recognition/query → possible medicine matches.
6. Home → emergency information.
7. Home `9` → reminder alert demo → record or postpone.
8. Home `5` → switch between Traditional Chinese (`zh-TW`) and US English (`en-US`).

All current data is fixture data in `src/data/fixtures.js`. Today’s completion toggles persist in `localStorage` under `medaboutyou-today-doses`.

User-entered medicines persist a submitted `name`, optional `directions`, reminder times, and archive state under `medaboutyou-user-medicines`. Existing `customDescription` records are migrated to `customDirections` on load. User-entered values are displayed as data and are not translated.

Directions and reminders are editable from every medicine detail screen. Reminder choices are the sorted union of times used by all active medicines, followed by an `n + 1` Other time action backed by a native time input. Updates to fixture medicines persist as user overrides under `medaboutyou-medicine-settings`; updates to manually entered medicines are written back to their existing `medaboutyou-user-medicines` record. Saving either field returns to medicine details and never enters the dose-history flow. Archived medicines move to a separate list and can be restored; deleting requires confirmation.

### Possible medicine cards

Search results use an `n + 1` horizontal card deck. The first `n` cards come from the medicine-search API; the current mock contains three results. `ArrowLeft` and `ArrowRight` flip between cards, and the partial cards at either side plus the page dots communicate position without adding multiple borders.

Each result card begins with a medicine image, followed by the generic name, primary action, common side effects, and indications. `ArrowUp` and `ArrowDown` scroll within the active card. A subtle bottom fade is rendered only while more content remains below. The final card uses a circular `+` action and opens manual medicine entry.

The current mock images are local neutral SVG illustrations. API results should provide an image URL or asset identifier and retain useful localized alt text.

## Localization

The app uses the template's existing i18next, react-i18next, and browser-language-detector dependencies. Resources live under `src/assets/locales/zh-TW` and `src/assets/locales/en-US`. Detection checks the saved `medaboutyou-language` preference first and then the browser locale. Traditional Chinese is the fallback.

All current screens, fixture medicine names, soft keys, accessibility labels, and feedback text use translation keys. New API values such as official medicine names remain data and should not be used as translation keys.

## Photo/file requirement

The upload screen intentionally uses only a native HTML file input:

```html
<input type="file" accept="image/*" capture="environment" />
```

On a supported phone this opens the system camera or image picker. After selection, the file enters the recognition flow directly. The app does not render a camera view or an image preview, which keeps the QVGA interface simple and avoids extra memory use.

The current recognition step is a 1.2 second frontend mock. It then displays `medicineCandidates`, shaped like the planned search API result with an id, strength, and confidence score. When the backend contract is ready, replace the fixture with the response from a `multipart/form-data` upload while keeping the same loading, candidate, error, and cancel states. Do not put the image into base64 or `localStorage`.

## Component map

- `DeviceShell`: fixed header/content/soft-key frame and keyboard event surface.
- `ListRow`: reusable menu/action row with focus, danger, and success states.
- `MedicineRow`: medicine identity, schedule, completion, and focus states.
- `Decision`: keyboard/pointer binary choice.
- `QuantityPicker`: half-unit quantity adjustment.
- `FeedbackCard`: success or emergency feedback.

Application state and screen transitions currently live in `src/App.jsx`. Components are intentionally presentational so a backend store or router can be introduced later without changing the visual system.
