# Shipwright 1.2.1 — retained runtime snapshot

One manifest v2 for single or combined exports, package name/version, stable destination folders, canonical sprite paths, deduplication and guarded staged replacement.

## Decisions

I wanted an exported fleet to be understandable as one package with traceable files and explicit game-verification status.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
