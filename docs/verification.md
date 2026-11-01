# Verification record — 1 November 2026

The local V1.0.2 build passed TypeScript checking, 14 core/domain/session tests, the original weapon editing workflow, all five hull-class reference checks and zoom-independent comparison checks.

Both source and packaged Windows executable passed the geometry/export/reopen workflow. Every context menu exposed all four tools; all 16 mode transitions preserved geometry and synchronized the selector. Actual delayed saves, out-of-order imports, intervening edits, save cancellation/failure, malformed imports and undo-to-saved behavior were exercised. Exported sizes/hashes and hull contents were read back; injected write failure left no partial final package or owned staging folder. Fresh UI and exported preview images were opened for inspection.

These are historical local results, not CI results. Tests require the local PNG fixtures described in the README. No Starsector launch, target-runtime hull loading, engine rendering/handling, balance trial or performance measurement was performed. The generated manifest therefore marks `gameVerified: false`.
