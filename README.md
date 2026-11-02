# Shipwright 1.1.1 — retained runtime snapshot

Rejects nonfinite unknown fields before cloning/serialization, removes completed import jobs, cancels late opens, separates native import responsibilities and uses immutable listing summaries.

## Decisions

I found that successful import work also needs an end to its lifetime. I wanted clear native boundaries and preserved source values.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
