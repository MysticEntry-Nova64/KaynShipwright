# Shipwright 1.0.3 — Scaling and serialization checks

Validates resize input before copying, rejects nonfinite derived geometry and preserves the original model when scaling fails. Adds version/encoding guards and aim diagnostics.

## Decisions

I found that finite stored inputs can still overflow derived arithmetic, and JSON copying can hide invalid numbers. I wanted rejection to happen before data changes.

## Archive status

Retained version archive, published retrospectively. The archive identifies its application payload and checksum; it does not inherit the 2.0.0 regression results. Historical runtime snapshots may include compiled JavaScript rather than the original TypeScript source. Earlier behavior and known limitations are preserved for comparison. Use 2.0.0 for current work.
