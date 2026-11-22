# Shipwright 2.0.1 — state-specific assistant artwork

The missing-installation Oops guide always uses v11 Wink. The close dialog uses the selected v4 farewell salute, with a small warm smile. There is no global appearance panel; legacy appearance preferences are ignored and retained.

This patch also explicitly includes best-effort location discovery for unavailable drives and the already-installed closed-document callback cleanup. Existing project/save/recovery format and application identity remain unchanged.

## Verification

TypeScript/bundle build and all 73 unit tests passed, with no failures or skips. The actual portable executable and byte-identical side-by-side installed 2.0.1 copy, using the shipped opt-in isolated hidden smoke mode, passed fixed Wink startup with legacy Gentle/Serious preferences left unchanged, native close/Keep editing/Escape/reopen with the selected v4 farewell, exact PNG hashes/dimensions, missing-art DOM fallbacks, and supported 1080x720/1440x960 contexts at DPR1. Visual acceptance uses the reviewed portable normal-state captures and all ten reviewed installed captures, including correct fallback states. Two portable late-state negative capture frames were stale and are excluded from visual evidence; DOM assertions alone do not establish screenshot freshness. The 110px check is a supplemental below-minimum renderer probe. All owned app processes exited cleanly. Automation did not launch a visible user session; default startup guards/options were checked by the focused VM unit test. Previously verified deterministic persistence/source-round-trip/child-process fixtures are retained to reproduce this suite; they are not new mascot production behavior. Project AGENTS.md and working standards are intentional maintenance guidance. These scoped checks do not transfer every 2.0.0 suite to this release.

Current screenshots come from the actual 2.0.1 packaged application. The older 2.0.0 GIF is historical. No universal accessibility, long-session retention, power-loss or game-readiness claim is made.
