# Shipwright 1.3.0-studio.1 — retained runtime snapshot

Isolated Studio preview with searchable mounts, selected-properties inspector, Canvas focus, grouped file actions and export review. Separate default test profile.

## Decisions

I wanted the new layout to be reviewable in a separate test build before promoting it.

This tag archives the retained compiled runtime, published retrospectively. It does not reconstruct missing TypeScript and is not a complete rebuildable development checkout. Download the portable release ZIP to run it; use main/v2.0.0 for current development. Local game/reference PNGs are excluded from this source snapshot.

Private non-runtime documents/scripts were removed. Application code and required assets in the portable ZIP preserve the retained runtime bytes. Earlier versions do not inherit 2.0.0 tests.
