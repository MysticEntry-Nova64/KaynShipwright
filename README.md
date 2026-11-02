# Shipwright 1.2.0 — retained runtime snapshot

Per-document history/view/session ownership, unsaved-draft recovery, automatic PNG outlines, batch saves and batch layout exports with individual results.

## Decisions

I found that switching designs requires explicit ownership for edits and late saves. I wanted drafts and partial batch failures to remain recoverable.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
