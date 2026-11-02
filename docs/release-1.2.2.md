# Shipwright 1.2.2 — Explicit close choices and bounded recovery

Themed Keep editing / Close with recovery / Close all dialog, final-write flush, guarded clearing and failure feedback. This archive includes the retained recovery backpressure correction: active plus latest pending snapshot.

## Decisions

I wanted closing to explain what survives next launch. I found that recovery should retain the latest state rather than every queued revision.

## Archive status

Retained version archive, published retrospectively. The archive identifies its application payload and checksum; it does not inherit the 2.0.0 regression results. Historical runtime snapshots may include compiled JavaScript rather than the original TypeScript source. Earlier behavior and known limitations are preserved for comparison. Use 2.0.0 for current work.
