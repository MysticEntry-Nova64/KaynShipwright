# Code map: functions, triggers and ownership

This is the navigation guide for 2.0.0. Links point to owning source files; search the named symbol rather than depending on line numbers that drift. “Pointer” below means a code reference or a canvas pointer event, not an exposed native address.

## Entry points and module boundaries

| Owner | Functions / entry points | Trigger and result |
| --- | --- | --- |
| [main.cjs](../main.cjs) | `activatePrimary`, `app.whenReady`, IPC registrations | Process startup acquires a single-instance lock and creates the sandboxed window. A second process focuses the first. Native handlers validate sender/input before dialogs or disk writes. |
| [preload.cjs](../preload.cjs), [desktop-api.ts](../src/desktop-api.ts) | typed `window.desktop` bridge | Explicit IPC methods cross the renderer boundary. Renderer has no Node integration; new windows and navigation are denied. |
| [editor.ts](../src/editor.ts) | `load`, `newDocument`, `commit`, `render`, `draw` | Coordinates active project, view and session. `commit` validates completed edits, advances history/revision and schedules recovery. New loads add independent documents. |
| [studio-ui.ts](../src/studio-ui.ts) | `installStudioUI`, `refresh`, `filter`, `reviewState`, `fileState` | Layout selection, mount search, menus and export review. Host callbacks select mounts, redraw after layout changes and obtain export checks. This module never writes projects or owns history. Installed once per window. |
| [core.ts](../src/core.ts) | `fromShip`, `parseProject`, `validate`, `toShip`, `resize`, `History` | Domain conversion, safe validation and bounded editing snapshots. Scaling validates source before cloning and candidate before publication. History retains at most 80 snapshots; immutable image strings are shared. |
| [geometry.ts](../src/geometry.ts) | `edit`, `outlineErrors`, `addEngine`, `copyEngine`, `insertVertex`, `rectangleBounds` | Pure candidate transformations and geometry rules. Invalid candidates leave the current model unchanged. |
| [geometry-editor.ts](../src/geometry-editor.ts) | `installGeometry` | Tool fields, geometry handles and context actions delegate through host editing/gesture callbacks. |
| [gesture.ts](../src/gesture.ts) | `GestureController.begin`, `finish`, `cancel`, `owns` | One owner of pointer capture. Pointer-up finishes; Escape, pointer cancellation, capture loss and window blur restore canceled state. Active state is cleared before its completion callback; capture is released in `finally`. |
| [document-session.ts](../src/document-session.ts) | `load`, `change`, `restore`, `beginLoad`, `accepts`, `beginSave`, `finishSave` | Revision identity determines dirty state. Generation tickets reject stale asynchronous loads. Save completion belongs to its captured document/revision, not whichever tab is now selected. |
| [png-drop.ts](../src/png-drop.ts) | `preparePNGDrop` | Drop/file chooser decodes a bounded PNG batch, creates unique IDs and checks liveness before publication. |
| [auto-outline.ts](../src/auto-outline.ts) | `generateOutline`, `outlineForProject`, `convex` | PNG alpha mask produces candidate bounds. Editor checks document presence, image and revision after decoding; manual changes win over late generated results. |
| [ship-library.ts](../src/ship-library.ts) | `installShipLibrary` | Browse, search, preview, add and open-copy events. Generation ownership rejects closed-dialog or superseded work. |
| [startup.ts](../src/startup.ts) | `installStartup` | Location discovery/selection, first-run guidance, second-instance notice. Missing game location does not block ordinary editing. |
| [references.ts](../src/references.ts) | `loadReference`, `drawReferences` | Class selector, comparison dialog and viewport resize. Comparison is display-only at one common scale. |
| [preview.ts](../src/preview.ts) | `previewPNG` | Export creates a labeled preview from its captured project. |
| [package-dialog.ts](../src/package-dialog.ts) | `choosePackageMetadata`, `restorePackageSettings`, `packageSettings` | Export asks for name/version; metadata is restored with workspace recovery. Cancel returns without publishing. |

## Persistence and native IO

| Owner | Boundary and contract |
| --- | --- |
| [editor.ts](../src/editor.ts) | `rememberDrop` records the active document; `snapshotWorkspace` captures all open documents; `activateDocument`/`openDropped` switch ownership. `scheduleRecovery` debounces 350 ms. Explicit saves capture their owner and serialize completion. |
| [recovery-writer.ts](../src/recovery-writer.ts) | `enqueue` owns at most one active snapshot and one replaceable pending snapshot. `drain` writes the latest pending state; `flush` awaits completion and reports terminal failure. This coalescing policy is only for recovery, never ordered explicit saves. |
| [native/workspace-service.cjs](../native/workspace-service.cjs) | `checkWorkspace`, `createWorkspaceStore`, `preflight`, `runBatch`. Up to 16 documents; 150 MB serialized recovery/batch limit. Store rotates a valid previous copy; reads fall back with a warning. Batch results retain per-document success/failure. Duplicate IDs reject before publication. |
| [save-service.cjs](../save-service.cjs) | `saveFile` writes an owned sibling staging file, verifies readback and replaces the target. Failures preserve the previous target; cleanup errors retain useful context. No power-loss durability promise. |
| [package-service.cjs](../package-service.cjs) | `buildDesignPack`, `exportPackage`, `exportFleetPackage` preflight paths, collisions, image data and IDs, then stage and verify a complete pack. Recognized existing packs have guarded replacement. Manifest v2 records hashes and `gameVerified=false`. |
| [native/file-io.cjs](../native/file-io.cjs) | `boundedRead`, `serializeJson`, `hash`. Nonfinite numbers are rejected before JSON can turn them into null; reads are checked before and after loading. |
| [import-service.cjs](../import-service.cjs) and [native/import-ipc.cjs](../native/import-ipc.cjs) | Native orchestration, dialogs and IPC registration; source parsing, library storage and image checks remain separate. |
| [native/ship-format.cjs](../native/ship-format.cjs) | Source normalization and export preservation, including grouped slots and omitted optional arrays. |
| [native/ship-source.cjs](../native/ship-source.cjs) | Game/mod discovery and hull/sprite pairing. Original inputs are read-only. |
| [native/ship-library.cjs](../native/ship-library.cjs) | Immutable library entries, summaries and copy reads. Completed work must leave pending registries. |
| [native/location-service.cjs](../native/location-service.cjs) | Installation detection, validation and remembered location. |
| [native/assets.cjs](../native/assets.cjs) | Native image/header and asset-boundary checks used by imports. |

## Representative event paths

1. **Drag → edit:** canvas pointer-down → tool candidate + `GestureController.begin` → pointer move → pointer-up/`finish` → validate/commit → revision/history → redraw/recovery debounce. Cancel restores without adding history.
2. **Save during a drag:** finish gesture → capture project and save ticket → native chooser → `saveFile` staging/readback/publication → `finishSave(ticket)` on its owning document. A later edit stays dirty.
3. **Review export:** `reviewExport` → `reviewState` for current/all scope → existing export button → gesture settlement/snapshot → package metadata if needed → native destination → preflight/stage/readback/publication. Export does not mark a project saved.
4. **Recovery:** debounce → cloned workspace → coalescing writer → bridge → serialized store write. Close with recovery flushes the final snapshot before `prepareExit`/`closeReady`.
5. **Close:** native close sends `prepare-close` → renderer dialog focuses Keep editing. Recovery waits for writes; discard drains and suppresses late writes before clearing both copies. Pending saves/exports block closure. Failure keeps designs open and re-enables actions.
6. **Import copy:** native source/parser/image checks → immutable library entry → asynchronous copy read → session ticket check → new independent document. Dialog cancellation or a newer load cannot publish stale results.

## UI source and extension rules

[index.html](../index.html) owns semantic controls/dialogs; [style.css](../style.css) owns base surfaces; [studio.css](../studio.css) owns the Studio/focus shell. Keep control IDs unique. Focus grid selectors must override the existing workspace-panel `:has(...)` selector, including the minimum-width breakpoint. Close artwork is a static transparent asset; it owns no timer or listener.

Keep model mutation inside the existing validation/history boundary. Add bridge operations explicitly rather than exposing Node to the renderer. Preserve session and pointer ownership across asynchronous work. Instance-lifetime listeners belong to their one window; a future remountable controller would need a matching disposal contract. Memory bounds by item count do not alone bound payload bytes.

I wanted the new shell to remain a small presentation module so the tested geometry and IO owners stayed recognizable. I found that naming triggers and ownership at each asynchronous boundary makes stale-load, late-save and close bugs easier to review than a list of handlers alone.

## Verification pointers

`tests/*.test.ts`: domain/numerical rules, history/session ownership, staged IO and package/recovery behavior. `tests/studio-ui.cjs`: menus, search, keyboard selection, layout persistence and review-to-real-export. `geometry-ui.cjs`: tools, gestures, delayed save and package readback. `workspace-ui.cjs`: independent documents, partial batch failure/retry and restart. `close-ui.cjs`: recovery/clear failures and restart. `aim-contract.cjs` and `audit-regressions.cjs`: cancellation/settlement/ownership. `scaling-ui.cjs`: overflow rejection preserves export. `recovery-memory-ui.cjs`: real blocked-write heap retaining paths. `release-soak.cjs`: bounded repeated edits, resource counters and close layout. See [verification](verification.md) for scope and limits.
