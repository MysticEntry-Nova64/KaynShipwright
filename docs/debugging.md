# Debugging Shipwright

Write a report as: **When [action and preconditions], I expected [observable
result], but observed [actual result and frequency].** Include the exact version,
executable/build hash, project fixture, reproduction steps and original evidence.

Before changing product code, list competing direct causes. For each, write the
experiment, predicted observation, actual observation and what it rules out.
Include an invalid test expectation, wrong input target and observation effects
where relevant. Vary one factor where possible. A passing rerun is not a cause.

## Aim-drag investigation,1 November2026

When the original cold-start weapon sequence drags ME01's aim handle, direction
should change from0 after a committed drag. One of12fresh launches retained0;
another failed the preceding mount-position check. The root cause is unresolved.

| Candidate | Discriminating observation | Result |
| --- | --- | --- |
| Incorrect angle math | Known horizontal-right endpoint gives-90 in inspector/export | Passed |
| Wrong or stale control coordinates | Hit test misses, model remains unchanged | Controlled miss reproduced |
| Canceled gesture | Escape/cancel/blur restores preview with no commit | Passed; blur/cancel injected |
| Inspector-only lag | Inspector differs from eventual exported model | Not observed in checked runs |
| Cold-start/observation timing | Cold original differs from warm/traced runs | Original2/12fail;72traced cold pass |

The48warm original/guarded comparisons passed. Tracing can perturb timing; do not
call the app fixed or the original failure conclusively test-only.

Valid drag expectations: pointerdown hits the intended handle, capture belongs to
the gesture, movement arrives with button held, no cancellation occurs, pointerup
commits once, model/export and inspector agree, Undo reverses and Redo restores.
A stale target or canceled gesture must not be asserted as a successful edit.

## Focused commands

```powershell
npm run test:aim
npm run diagnose:aim
# To select installed build, set SHIPWRIGHT_EXECUTABLE to its absolute .exe path.
```

The contract test validates physical direction against actual exported model,
Undo/Redo, cancellation and stale-coordinate controls. The diagnostic command
records input events, target/focus and immediate/delayed values. Instrumented
success does not replace an uninstrumented failure. `tests/ui.cjs` saves a
post-failure JSON/screenshot; last gesture context need not be the failing action.
Temporary probes belong in tests, and must be removed/disabled before final
verification. Validate the reporting mechanism with a known deliberate failure.

## Report/experiment template

- Trigger, fixture, build/executable/hash, platform/runtime.
- Expected result and why that expectation is valid; actual result/frequency.
- Reproduction and original logs/screenshot/event timing.
- Hypotheses / prediction / observation / interpretation.
- Intervention or workaround, separate from diagnosis; adjacent consequences.
- Before/after checks; cleanup and final retest; unresolved branches/next evidence.

Applied sources: supplied topic06Debugging slides42–60 and Herman Tulleken's
How to debug for game programmers(2023),pages4–16,18–23. Both critically reviewed;
page14duplicate state guard is erroneous. Do not copy examples without checking.

Raw diagnostic outputs live in ignored `test-results/aim-diagnosis/` and
`test-results/aim-contract/` folders. Preserve a failing run before rerunning.
No product runtime change,OS hardware/focus test,game/performance result or exact
historical-cause claim follows from this investigation.
