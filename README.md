# Shipwright 1.2.2 — retained runtime snapshot

Themed Keep editing / Close with recovery / Close all dialog, final-write flush, guarded clearing and failure feedback. This archive includes the retained recovery backpressure correction: active plus latest pending snapshot.

## Decisions

I wanted closing to explain what survives next launch. I found that recovery should retain the latest state rather than every queued revision.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
