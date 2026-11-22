# Fixed dialog artwork

Shipwright's illustrations follow their dialog states. The missing-installation
“Oops…” guide always shows the v11 Wink. The close dialog uses a separate farewell
salute. There is no appearance panel, expression selector or global mascot choice.
Legacy `shipwright.assistant.expression.v1` preferences are ignored and left in
place; this feature does not migrate, clear or rewrite user preferences.

The location guide consumes an exact 144px transparent PNG. The farewell salute
uses an exact 160px PNG, with a 110px PNG below the 600 CSS-pixel breakpoint. The
supported native desktop window minimum remains 1080px. Images retain their
square canvas and use `object-fit: contain`.

`src/dialog-artwork.ts` handles only decorative image loading failures. If an
image is unavailable, it hides the broken illustration and shows a short text
fallback. Dialog instructions, focus and actions still belong to their existing
startup/close owners. The artwork helper owns no selection, preference, timer,
project, save or recovery state. Missing images do not block ordinary editing or
the close choices.

`assets/ui/state-artwork-2026-11-22/manifest.json` records exact consumed copies,
portable source-artwork labels and SHA-256 values. The old location and close PNG files
remain intact. Earlier expression assets and the previous appearance-panel
implementation remain in retained source/evidence history. No artistic approval
or native Krita Composition activation is implied by an app integration check.

## Focused verification

Run `npm run build`, `npm test`, then `node tests/state-artwork-ui.cjs`. Set
`SHIPWRIGHT_STATE_ARTWORK_OUTPUT` to a fresh absent directory to choose where the
runtime receipt, before-execution source hashes and screenshots are written. A
run refuses to replace an earlier evidence directory.

Source-mode checks launch actual production main/preload/renderer code through a
test-only hidden BrowserWindow bootstrap. Set SHIPWRIGHT_EXECUTABLE to select an
actual packaged executable; the opt-in hidden smoke mode keeps its native startup
path and records app.isPackaged, version, isolated profile and executable/archive identities.
The exact SHIPWRIGHT_TEST_HIDDEN=1 flag requires an explicit absolute
SHIPWRIGHT_USER_DATA different from the normal profile. Invalid hidden mode exits
before profile selection, locking or window creation. Normal launches do not set
this flag and retain their usual visible startup. It uses fresh disposable profiles,
records real window visibility/focus, and sends no operating-system input. It
seeds Gentle and Serious legacy preferences in those profiles, restarts owned
app processes and checks normal startup Wink. It verifies that those stored
preferences stay unchanged and no appearance controls exist.

The actual native close event must show the selected salute with Keep editing
focused. Repeating close after Keep editing and Escape must preserve the same
artwork and choice order. Exact PNG response hashes/dimensions, minimum supported
layout and supplementary responsive 110px layout are checked. Missing-image
controls redirect only disposable test DOM image URLs to absent local files;
production assets stay intact. All child exits are awaited. Exact source, test,
bootstrap and asset identities are captured before execution and rechecked after.

A test command documented here is not itself a passing result. Retain the actual
run receipt and screenshots for the checks completed. A source-only check does not establish a packaged result. Packaged checks use
an explicit executable and disposable profile. Neither check establishes screen-reader speech,
native Krita behavior, every platform/theme, or game readiness.


Hidden-window images use Electron webContents.capturePage with stayHidden:true; visibility, focus, image size and PNG dimensions are checked. The harness records its owned-window scheduling overrides and Chromium automation flags. Native capture can return a stale compositor frame: every accepted image must be visually reviewed after DOM readiness. The release uses reviewed portable normal-state pictures and reviewed installed fallback pictures, and retains two rejected stale portable negative frames. These capture conditions do not change ordinary production startup or imply performance results.
