# Import from Starsector —1.1.0

1.Click **Import from Starsector**. Choose one `.ship` file,or browse a game or
mod folder. A game folder scans its `starsector-core` and ship-containing mod
folders; a mod folder scans its `data/hulls`. This lists installed content,not
only enabled mods. Select a ship to preview its sprite; search by name,ID or source.
2.Click **Add to library**. The sprite is resolved from that content folder first,
then a unique matching sprite in the selected packages. Missing/ambiguous matches
request a PNG. Native image decoding and layout validation finish before saving.
3.Under **My imported ships**,choose an optional copy name/new hull ID and click
**Open copy**. The defaults append `(copy)` and `_copy`,with a corresponding new
export sprite path. Unsaved work is protected before switching documents.
4.Edit and Save project/export normally. Saved projects embed the sprite. Library
entries remain unchanged when their editable copies are modified.

## Storage and preservation

The library lives under the app user-data folder,in `imported-ships`. Each entry
has a unique directory and immutable project with embedded PNG,source provenance
and SHA256hashes. Publication uses an owned staged directory and exact readback;
failure cleans that staging without overwriting existing entries. Identical
source bytes/path/sprite imports deduplicate within the app; different mods with
the same hull ID remain separate. Edited source bytes create another entry.

Imports never write to game files,bundled examples or previous library entries.
Browsing/importing does not switch the active document; only Open copy does.
Canceling a native dialog or failing parsing,PNG decode or validation publishes
nothing. A pending library open cannot replace intervening document edits.
Unreadable saved entries are reported while valid entries remain usable.

The parser supports JSON with `#`,`//`,`/* */`comments and trailing commas,without
evaluating code. Unknown hull fields and original slot IDs are preserved. Game
slot categories SYSTEM,LAUNCH_BAY and STATION_MODULE,and safe relative mod sprite
paths outside `graphics/ships`,are accepted. Comment formatting is not preserved
in the editable JSON copy; original source bytes remain untouched.

## Scope and checks

This imports `.ship`layouts and PNG sprites. It does not merge `.skin`overrides,
resolve variants/stats/scripts,assemble modular ships or produce a complete mod.
Unsupported layouts report validation errors instead of losing fields silently.
Missing dependency sprites can be selected manually. Scan caps:5000ships,30000
visited items,12directory levels. Hull input4MB,sprite40MB,PNGdimension16384.

`npm run test:imports` checks direct/folder imports,preview/search,same-ID mods,
manual/canceled sprite selection,malformed inputs,duplicate behavior,unsaved
replacement,invalid copy IDs,export round trip,restart/detached sources,stale-open
rejection and unchanged source/example hashes using isolated app data.
`npm test` also checks parser boundaries,concurrent duplicate publication,write
failure cleanup and corrupt-entry recovery. Local real-file review found673ship
files across10sources with0parse errors; only4representative vanilla layouts
were prepared/compared in that review,not all673validated or game-tested.

No automatic GitHub upload of imported content occurs. The historical intermittent
cold-start aim cause remains unresolved; import checks do not establish zero bugs.
# Compatibility update — 1.1.2

The browser previews images independently of editing eligibility. Multi-position slots are supported as grouped markers, with one slot ID and preserved position order. Missing optional arrays are normalized internally and omitted again on unchanged export. Zero-size engine marker pairs are retained with warnings. Unsupported collision outlines and duplicate IDs remain visible as read-only previews; missing sprites require user selection. See [1.1.2 results](release-1.1.2.md), which supersede earlier restrictions below where explicitly stated.

