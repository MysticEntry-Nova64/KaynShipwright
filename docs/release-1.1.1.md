# Shipwright 1.1.1 — Import boundaries and retention

Rejects nonfinite unknown fields before cloning/serialization, removes completed import jobs, cancels late opens, separates native import responsibilities and uses immutable listing summaries.

## Decisions

I found that successful import work also needs an end to its lifetime. I wanted clear native boundaries and preserved source values.

## Archive status

Retained version archive, published retrospectively. The archive identifies its application payload and checksum; it does not inherit the 2.0.0 regression results. Historical runtime snapshots may include compiled JavaScript rather than the original TypeScript source. Earlier behavior and known limitations are preserved for comparison. Use 2.0.0 for current work.
