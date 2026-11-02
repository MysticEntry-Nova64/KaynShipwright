# Shipwright 1.1.2 — retained runtime snapshot

Preserves grouped weapon positions and omitted optional arrays, separates sprite browsing from editing eligibility, and reports unsupported outlines and duplicate IDs without rewriting them.

## Decisions

I thought a readable preview and an editable layout needed separate checks. I wanted compatible data to round-trip without silently changing its meaning.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
