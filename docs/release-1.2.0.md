# Shipwright 1.2.0 — Persistent multi-design workspace

Per-document history/view/session ownership, unsaved-draft recovery, automatic PNG outlines, batch saves and batch layout exports with individual results.

## Decisions

I found that switching designs requires explicit ownership for edits and late saves. I wanted drafts and partial batch failures to remain recoverable.

## Archive status

Retained version archive, published retrospectively. The archive identifies its application payload and checksum; it does not inherit the 2.0.0 regression results. Historical runtime snapshots may include compiled JavaScript rather than the original TypeScript source. Earlier behavior and known limitations are preserved for comparison. Use 2.0.0 for current work.
