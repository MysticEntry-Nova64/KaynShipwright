# Gesture and save ownership

`GestureController` owns one pointer capture at a time. A completed gesture commits its validated candidate; cancellation restores the prior state without adding history. Escape, pointer cancellation, capture loss and window blur cancel. Clearing active ownership before calling the completion callback prevents re-entry from completing the same gesture twice.

Save and export finish an active gesture before taking their snapshot. An explicit save captures a document/revision ticket; its eventual result updates that owner, including when another document is now active. Revision identity and save-operation order are different. Undo can return to an earlier revision without making an old asynchronous load current.

Native writes use owned sibling staging files, readback verification and guarded replacement. A failed write must not replace the previous target. Cleanup failures report the retained staging location. These guarantees do not establish power-loss durability.

See the [code map](code-map.md) for functions and triggers, and the [verification record](verification.md) for the exercised paths and limits.
