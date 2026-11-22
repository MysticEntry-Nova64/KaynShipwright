# Shipwright project guidance

Read [working standards](docs/working-standards.md) and the relevant owners in the
[code map](docs/code-map.md) before changing application behavior or regression tests.

- Preserve import sources, unknown fields, geometry, document/revision ownership,
  explicit save ordering and the distinction between save, export and recovery.
- For source/test changes, run `npm run build` and `npm test`. `npm run test:persistence`
  is a focused subset for iteration. Extend existing coverage rather than duplicating it.
- For persistence/workspace changes, exercise the relevant real-app save/restart/close
  paths with disposable profiles. Label source and packaged checks accurately.
- Make failure tests deterministic. Verify the intended failure boundary, await owned
  workers/children, and keep cleanup independent of the contract being tested.
- Keep standalone performance experiments outside the application. Require a measured
  editor bottleneck and equivalent behavior before adopting an optimization.
- Preserve unrelated working-tree changes. Record actual results and material limits;
  assertion counts alone do not establish product improvement.
