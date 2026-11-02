# 2.0.0 verification

Release checks used Windows x64, Electron 45.2.1, Playwright 1.64.1 and Node 24.22.1. Tests selected the actual packaged executable and disposable profiles; native file choosers and selected failures were redirected deliberately by the harness.

- TypeScript check, esbuild bundles and 63 unit tests passed, with no skipped tests.
- 13 packaged suites passed: startup smoke, Studio, geometry, workspace, close, imports, startup/location, PNG drops, aim contracts, class references, save/gesture regressions, scaling and recovery heap retention.
- Save/readback, canceled and delayed saves, partial-write failure, batch partial failure/retry, duplicate IDs, stale/canceled imports, exact exported values, restart recovery and clear-failure paths were exercised.
- Numerical checks include nonfinite data before JSON copying, derived coordinate/polygon overflow, rejected scaling with preserved export, and validated candidate geometry. This is not a proof for every representable input.
- The repeated-use probe completed 700 edits, 70 layout switches and 70 export-review cycles. Across seven diagnostic-GC boundaries, listeners stayed at 147, DOM nodes ended at 1,395 versus 1,533 after warmup, and renderer live heap grew 105,248 bytes (about 103 KiB). This is a short bounded fixed-workspace probe, not a long-session soak or native/GPU leak proof.
- A separate real blocked-recovery-write probe submitted 13 changing states across the debounce. Retention stayed at active plus latest pending; draining wrote the newest state and released expired snapshots. Heap snapshots stayed local.
- Fresh Studio/focus and 1080×720 close/minimum-window screenshots were inspected. Keep editing has initial focus; Escape returns to editing; the saluting image decodes and fits inside the close dialog.
- The 486-frame demonstration decodes fully, loops, runs 32,400 ms at an average 15 fps and verifies the real exported package manifest. Captions/progress are presentation overlays on actual app captures.

## Review and cleanup

The Studio controller owns presentation and delegates edits/IO to existing owners. Its handlers were expanded for readability; accidental blank-line multiplication in the editor was removed. No speculative model/native rewrite or claimed speedup was introduced. History is bounded at 80 snapshots and shares immutable image strings. Recovery coalesces superseded pending snapshots; PNG/recovery/batch paths retain byte/pixel/document limits. Async load, save, outline and pointer ownership were reviewed against current source and exercised by existing regression paths.

Legacy tests were corrected where their expectations predated the additive workspace, hidden Studio menus and manifest v2 paths. Gesture tests now open menus through keyboard while holding a drag rather than creating a second mouse gesture. These were test-contract corrections, not evidence that the original application behavior was broken.

## Limits

No universal bug-free, overflow-free or leak-free claim. No long-duration native/GPU/OS-handle audit, exhaustive source-format compatibility, full screen-reader/high-DPI/touch audit, power-loss durability or new Starsector combat verification. An intermittent historical cold aim-drag symptom still has no confirmed root cause; current physical-direction and cancellation contracts pass. Unsupported outlines, duplicate IDs, missing sprites, skins and modular-assembly limitations remain explicit. Export is a design pack, not a complete game-ready mod.

Historical archived versions were identified and checksummed separately. They do not inherit these results.
