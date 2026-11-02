# Shipwright 1.0.3 — retained runtime snapshot

Validates resize input before copying, rejects nonfinite derived geometry and preserves the original model when scaling fails. Adds version/encoding guards and aim diagnostics.

## Decisions

I found that finite stored inputs can still overflow derived arithmetic, and JSON copying can hide invalid numbers. I wanted rejection to happen before data changes.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
