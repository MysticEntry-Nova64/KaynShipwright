# Shipwright 2.0.0 — Studio release

Studio is the default. Canvas focus remains available and remembered. Searchable mounts, selected-only labels, selection-first properties, grouped file actions, export review, clear save/recovery wording and a matching saluting close assistant. Existing geometry, import, save, recovery and package features are preserved. Presentation controller and code documentation explain ownership.

## Decisions

I found that the old layout made frequently used controls compete with occasional settings. I wanted a clearer editing path, a larger-canvas option and more explicit export and close choices.

## Verification

63 unit tests, TypeScript/bundle checks and 13 packaged application suites passed. Additional repeated-use and blocked-write heap probes passed within their stated workloads. See [verification](verification.md). The 32.4-second GIF records the actual packaged app at 15 fps. No universal memory-safety, compatibility, accessibility, power-loss or game-verification claim.
