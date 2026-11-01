# Kayn Shipwright

Version **1.0.2**. Offline Electron/TypeScript Starsector hull-layout editor for Windows.

## Features

Right-click anywhere on the canvas to choose **Weapons**, **Shield**, **Engines** or **Collision bounds**. The active tool is marked and its editing actions appear below. Tool switching does not add geometry. The sidebar selector stays synchronized.

- Weapon position, mount properties and aiming/arc handles.
- Engine add/duplicate/mirror/delete, position, width and exhaust direction/length handles, exact fields and style/contrail settings.
- Shield center and radius editing. Radius zero disables the editor circle; game shield type remains a ship stat.
- Closed collision polygon vertex editing, nearest-edge insertion, deletion, rectangle/clear actions and collision radius editing.
- Candidate validation, undo/redo, canceled-gesture restoration, revision-owned saving and generation-owned loading.
- Design export: editable project, `.ship`, sprite, labeled PNG preview, validation and SHA-256 manifest. Writes to its own staged folder, reads files back and publishes the complete folder under a unique name.

## Local setup

Use Node.js 26 or a compatible runtime supporting direct TypeScript test execution, plus npm. Dependency versions are pinned in `package-lock.json`.

```sh
npm ci
npm run assets:local -- "ABSOLUTE_PATH_TO_EXISTING_SHIPWRIGHT_ASSETS"
npm run build
npm start
```

The PNG artwork is deliberately excluded from Git. Supply your authorized local assets from an existing Shipwright installation/source folder. Six required files: `verdant.png`, `talon-reference.png`, `lasher-reference.png`, `hammerhead-reference.png`, `eagle-reference.png`, `onslaught-reference.png`. `assets/class-references.json` contains display dimensions and file names; `assets/verdant.ship` is the example layout fixture. Sprite redistribution rights are not granted by this source upload. Local sprite assets are required for the startup example and UI checks; class comparisons require their local reference images.

## Build and checks

```sh
npm run build
npm test
npm run test:ui
npm run test:geometry
npm run test:session
npm run test:package
npm run test:classes
npm run test:references
npm run package
```

Run the geometry workflow before session/package checks because they use its generated fixture. Tests write ignored artifacts under `test-results/`. Packaging creates a portable Windows app under `release-v1.0.2/`. Generated bundles, dependencies, binaries, local PNG assets and test outputs are excluded from this source repository.

## Handoff workflow and limits

Save `.shipwright.json` for editing. Export the complete design folder for discussion and revisions; the preview supports visual review while the project preserves exact geometry and the manifest identifies artifacts. The package stages hull data for integration into an owning mod. Ship stats, variants, mod metadata, dependencies, balance and runtime verification remain separate. No active game files are written by export.

Nonempty bounds follow a conservative simple-polygon authoring policy; empty bounds remain supported as radius-only geometry. Screen/game coordinate conversion and class reference scale are independent of canvas zoom.

See [verification](docs/verification.md) for the checks performed and their limits. No license grant for third-party game artwork is implied. A source-code license has not yet been selected.
