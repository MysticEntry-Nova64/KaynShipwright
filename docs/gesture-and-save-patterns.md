# Shared gestures and failure-safe document saving

TypeScript / Electron / Node.js. Tags: pointer ownership, cancellation, undo, document revisions, staged writes, failure recovery.

Recorded 1 November 2026 from the locally fixed Kayn Shipwright V1.0.2 working tree based on commit `2ba02603e6c4b59d3e5a8b4c1ad05a93d4b36837`. Source changes were uncommitted when verified. These are reusable contracts supported by this project's checks, not a claim of universal filesystem or browser behavior.

## Gesture ownership

The original weapon handler committed pointer cancellation, while geometry could restore its snapshot. Both also exposed temporary geometry through the live model before recording a new revision. Saving during a drag could therefore save coordinates that Escape subsequently removed while the document stayed clean.

`src/gesture.ts` now owns one active canvas pointer and its completion callback. Weapon and geometry implementations retain a full pre-gesture snapshot. Successful completion publishes one undoable edit; cancellation restores the snapshot without adding history. The controller clears its active owner before calling back and releasing capture, so capture-release notifications do not finish the same gesture twice. Movement checks the owning pointer ID.

Integration sequence (illustrative; see the actual callers for their full state):

```typescript
// On pointerdown: cancel a previous gesture before capturing this snapshot.
gestures.cancel();
const before = clone(project);
gestures.begin(event.pointerId, cancel => {
  if (cancel) {
    project = before;
    render();
  } else {
    commit(); // Actual callers commit only when movement occurred.
  }
});

// Before Save or either export:
gestures.finish();
const snapshot = clone(project);
```

The usage sketch is explanatory, not separately executed code. Tested implementation: `src/gesture.ts`, `src/editor.ts`, `src/geometry-editor.ts`.

Policy matters as much as implementation: Save and exports finish before serializing; Undo finishes then reverses the edit; replacement settles before checking dirty state. Escape, pointercancel, capture loss and tool switching cancel. Blur/context menus share cancellation, but every OS ordering was not independently tested. If reused in an app with disposable views, add listener disposal: the current controller lives for the lifetime of its single editor window.

## Saved identity follows the written snapshot

Revision numbers identify history states; they do not describe save completion order. The failing sequence was save A, save B, Undo to A, save A, Redo to B. Rejecting A's completed save because its revision was numerically older left B falsely clean even though disk contained A.

Under Shipwright's existing `saveInFlight` serialization, `DocumentSession.finishSave` accepts the exact revision successfully written for the same document. A later edit remains dirty; a completion from another document cannot claim ownership. Canceled or failed saves never call successful completion.

Typical integration: settle the gesture, take the save ticket and snapshot together, await the serialized write, and finish the ticket only on success. If adding concurrent saves, introduce save-operation IDs/order and destination ownership; removing the serialization guard without redesigning completion ownership invalidates this fix's assumptions.

## Stage, verify, replace

`save-service.cjs` exposes `saveFile(destination, text)` and `main.cjs` invokes it only after validated IPC and a user-selected destination. Intended usage in the main process:

```javascript
const {saveFile} = require('./save-service.cjs');
await saveFile(selectedPath, JSON.stringify(snapshot, null, 2));
```

The service creates an owned temporary directory beside the destination, exclusively writes its temporary document, reads back exact bytes, and renames the complete file over the destination. It does not open the previous destination for writing. Keeping staging beside the destination avoids intentionally crossing filesystems during publication.

Failure handling has two distinct boundaries:

- Before publication, remove only the owned stage and rethrow the write/readback/replacement failure. If cleanup also fails, retain both errors and the temporary location.
- After publication, a cleanup error must not falsely turn a successful save into a failed save. The current service warns with the retained directory and returns success so saved-state ownership agrees with the published file.

The original direct-overwrite fault left a 130,660-byte project truncated to 100 invalid JSON bytes. With staging, the injected partial write affects only the temporary file; the previous destination remains byte-identical and retry succeeds.

## Verification and retrieval

Verified on Windows, Node v26.13.0, Electron 45.2.1, Playwright 1.64.1, on 1 November 2026:

- Build and 15 domain/save tests passed. `tests/save.test.ts` injects partial writes, readback mismatch, replacement failure and cleanup failure before/after publication.
- `tests/audit-regressions.cjs` passed from source and the freshly packaged app: A/B/undo/save/redo with disk and replacement-prompt checks; nine position/aim/arc cancellation combinations per runtime; weapon/engine active-drag Save, hull export, package export, Undo and tool changes; actual IPC partial-write preservation, dirty-state protection and retry.
- Existing editing, geometry/export/reopen, session races, package-failure containment and class/reference workflows passed. Packaged editor and preview PNGs were opened. Runtime-file byte comparisons confirmed the tested package contains the fixed build.

Verification contracts and runnable regressions are documented in this repository. See `docs/verification.md` and the regression tests.

Knowledge origin: independently inspected owning source and executable reproductions, plus the complete ACID section of the user's local *Principles of Transaction Processing* extract (PDF pages 27–33) as a review lens. Book guidance did not substitute for runtime checks. No new upstream API guarantee is claimed; different platforms/runtimes require revalidation.

Limits: filesystem faults were injected; no physical disk-full, power-loss durability, concurrent-process writer or OS touch-interruption proof. Cancellation/capture-loss events were dispatched after real mouse movement. Readback and rename do not establish crash durability. No Starsector/game compatibility, balance or performance claim. Project source license and artwork redistribution rights remain unresolved; this record grants neither. Documentation retention did not rerun application tests or change runtime code.
