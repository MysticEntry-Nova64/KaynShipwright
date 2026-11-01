# Verification record — 1 November 2026

The local V1.0.2 build passed TypeScript checking, 14 core/domain/session tests, the original weapon editing workflow, all five hull-class reference checks and zoom-independent comparison checks.

Both source and packaged Windows executable passed the geometry/export/reopen workflow. Every context menu exposed all four tools; all 16 mode transitions preserved geometry and synchronized the selector. Actual delayed saves, out-of-order imports, intervening edits, save cancellation/failure, malformed imports and undo-to-saved behavior were exercised. Exported sizes/hashes and hull contents were read back; injected write failure left no partial final package or owned staging folder. Fresh UI and exported preview images were opened for inspection.

These are historical local results, not CI results. Tests require the local PNG fixtures described in the README. No Starsector launch, target-runtime hull loading, engine rendering/handling, balance trial or performance measurement was performed. The generated manifest therefore marks `gameVerified: false`.

## Source-audit fixes — 1 November 2026

The audited baseline was commit `2ba02603e6c4b59d3e5a8b4c1ad05a93d4b36837`. Four independently reproduced reliability defects were corrected: saved-revision ownership after undo, serialization of transient drag geometry, destructive partial overwrite on ordinary save failure, and weapon cancellation committing movement. A shared pointer-gesture controller now handles completion and rollback for weapons and geometry. Save/export settle a gesture; Escape/cancellation/capture loss/tool switching restore it. Ordinary native saves stage/read back a sibling file before replacement. Save completions record their exact revision under the renderer's existing serialization contract.

Build and 15 domain/save tests passed. Staged-save failure checks cover partial writes, readback mismatch, replacement failure and cleanup failure before/after publication. The original weapon, geometry, session, package-failure, five-class and reference suites passed. Focused regressions passed from source and a newly built Windows package: A/B/undo/save/redo with disk/prompt checks; position/aim/arc cancellation through Escape, pointercancel and capture loss; engine/weapon Save and both exports during drags; Undo and tool switching; native partial-write failure preserving the old file and dirty document, cleanup and successful retry. Cancellation/capture-loss events were dispatched after actual mouse movement; physical OS touch interruptions were not simulated.

The packaged smoke test now requires an explicit absolute executable path and asserts the running version. Missing-path and intentionally wrong-version checks rejected their inputs; the new package passed startup, reference selection and unsaved-close protection, plus the complete geometry/export/reopen workflow. Packaged editor and exported preview PNGs were opened for inspection. This is local verification, not CI or game-runtime validation. Replacement tests do not establish power-loss durability. Installed release and shortcut were not replaced.

### Installed update — 1 November 2026

Following explicit user authorization, the fixed build replaced the installed V1.0.2 application folder after all 73 staged files were hash-verified. The previous application folder and original shortcut files were retained for rollback. Both the plain and versioned Desktop collection shortcuts now target the fixed V1.0.2 executable, with verified empty arguments and its application directory as working directory. Version remains 1.0.2; no separate public binary release was published.

Fresh build and all 15 domain/save tests passed. Against the installed executable, packaged smoke, focused audit regressions and the complete geometry/export/reopen workflow passed, including all 16 context-tool transitions. This supersedes the preceding historical statement that installation was untouched. The earlier v0.1.4 application files were preserved. No game or power-loss validation was added.
