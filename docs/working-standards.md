# Working standards

Use these standards when changing Shipwright. They describe review and verification
requirements, not a promise of exhaustive correctness.

## Preserve the user's work

- Import sources stay unchanged. Preserve unknown fields, grouped mount positions,
  optional-array presence and supported geometry through project and hull round trips.
- Save, export and workspace recovery have different meanings. A late save belongs
  to its captured document/revision; export does not clear unsaved changes.
- Validate before lossy serialization. Reject nonfinite values and derived overflow
  before publishing or partially mutating an existing design.
- Stage and read back a save before replacing its destination. Report publication
  separately from cleanup. Process termination can leave a staging folder; it is not
  proof that publication failed, and it does not authorize deleting recovery data.
- Recovery may coalesce superseded pending states. Explicit saves retain their order.
  Flush must wait for the final state on disk; rejected writes must permit recovery.
  Discard drains/suppresses late writes and removes both recovery copies.

## Choose evidence that can reject the explanation

1. State the expected behavior, affected owner and failure boundary before changing code.
2. Extend existing coverage instead of duplicating it. Use source-derived expected data,
   deterministic seeds and exact readback where preservation matters.
3. Coordinate asynchronous failures with acknowledgements or barriers. Avoid sleep-based
   guesses. Observe exit of each owned child before reading or removing its directory.
   Cleanup must wait for actual work completion independently of the contract under test;
   a premature `flush()` must not cause the harness to delete files while writes continue.
4. For a suspected fix, preserve the failing result and rerun the same case after the
   change. A test setup failure is not an application defect.
5. Run the build and complete unit suite. For persistence or workspace changes, also
   exercise real edit/save/export/restart/close behavior with disposable profiles.
6. Separate isolated tests, real-app checks and game verification. Forced process death
   does not verify power-loss durability. Passing counters do not establish leak freedom.
7. Record the environment, commands, substantive outcomes and remaining limits. Retain
   useful negative results; more assertions alone do not establish product improvement.

## Run the persistence regressions

After restoring authorized local assets and installing the pinned dependencies:

```sh
npm run build
npm test
npm run test:persistence
```

The final command is a focused subset for development; `npm test` already includes it.

| Test | Contract |
| --- | --- |
| `tests/source-format.test.ts` | Source preservation and 1,024 generated round trips across four fixed seeds, optional arrays, grouped mounts and unknown fields. |
| `tests/save.test.ts` | Failed stage writes/readback/replacement preserve the prior file; cleanup failure reports actual publication state. |
| `tests/save-crash.test.ts` | Twelve child terminations at before-write, partial-stage, complete-stage and post-rename barriers. Prior or new destination bytes remain complete. |
| `tests/recovery-disk.test.ts` | Exact latest/previous queued snapshots, failed-publication retry and coalesced flush through the real native store. |
| `tests/recovery-writer.test.ts` | Bounded pending work, obsolete/final failures, flush and retry semantics. |
| `tests/workspace.test.ts` | Recovery fallback, batch preflight/failures and queued discard. |

The child fixture lives under `tests/fixtures` and is never shipped as application code.
Crash tests use owned temporary directories, verify the intended barrier, await child
exit and remove those directories. They neither access real profiles nor assume that
an acknowledgement means a disk flush survived physical power loss.

For real-app checks, see [verification](verification.md) and the existing
`test:workspace`, `test:close` and `test:ui` commands. Select a disposable profile and the
intended source or packaged executable; label which one was tested.

## Keep performance experiments separate

Do not add spatial indexes, pools, workers or dependencies from a synthetic result alone.
First measure an actual editor bottleneck. Compare complete equivalent operations,
including index construction, invalidation, cleanup and memory cost, under the same
correctness oracle and workload. Keep standalone Java/C++ practice and benchmark
artifacts outside this application. Adopt the simplest solution supported by the
consuming workflow; a losing approach can still be useful under different conditions.

See the [code map](code-map.md) and [gesture/save contracts](gesture-and-save-patterns.md).
