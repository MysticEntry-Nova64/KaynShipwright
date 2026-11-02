# Shipwright 1.1.2 — Source-aware compatibility

Preserves grouped weapon positions and omitted optional arrays, separates sprite browsing from editing eligibility, and reports unsupported outlines and duplicate IDs without rewriting them.

## Decisions

I thought a readable preview and an editable layout needed separate checks. I wanted compatible data to round-trip without silently changing its meaning.

## Archive status

Retained version archive, published retrospectively. The archive identifies its application payload and checksum; it does not inherit the 2.0.0 regression results. Historical runtime snapshots may include compiled JavaScript rather than the original TypeScript source. Earlier behavior and known limitations are preserved for comparison. Use 2.0.0 for current work.
