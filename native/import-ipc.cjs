const { scan, prepare } = require("./ship-source.cjs");
const { createLibrary } = require("./ship-library.cjs");

function summarize(entry) {
  const hull = entry.project.hull;
  return {
    id: entry.id,
    name: hull.hullName,
    hullId: hull.hullId,
    hullSize: hull.hullSize,
    source: entry.sourceName,
    createdUTC: entry.createdUTC,
  };
}

function registerImportHandlers({
  ipcMain,
  dialog,
  nativeImage,
  window,
  directory,
}) {
  const library = createLibrary(directory);
  let catalog = new Map();

  function handle(channel, action) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (event.sender !== window.webContents) throw Error("Invalid sender");
      return action(...args);
    });
  }

  async function chooseFile(title, extensions) {
    const result = await dialog.showOpenDialog(window, {
      title,
      filters: [{ name: "Shipwright import", extensions }],
      properties: ["openFile"],
    });
    return result.canceled ? null : result.filePaths?.[0] || null;
  }

  function sourceEntry(id) {
    const entry = catalog.get(id);
    if (!entry) throw Error("Select a ship from the current source list.");
    return entry;
  }

  function verifyImage(bytes) {
    if (nativeImage.createFromBuffer(bytes).isEmpty()) {
      throw Error("Sprite PNG could not be decoded.");
    }
  }

  handle("ship-library-list", async () => {
    const result = await library.list();
    return {
      entries: result.entries.map(summarize),
      warnings: result.warnings,
    };
  });

  handle("ship-library-get", async (id) => (await library.get(id)).project);

  handle("ship-source-scan", async () => {
    const choice = await dialog.showOpenDialog(window, {
      title: "Choose Starsector installation or mod folder",
      properties: ["openDirectory"],
    });
    if (choice.canceled || !choice.filePaths?.length) return false;
    const entries = await scan(choice.filePaths[0]);
    catalog = new Map(entries.map((entry) => [entry.id, entry]));
    return entries.map(({ file, roots, ...entry }) => entry);
  });

  handle("ship-source-preview", async (id) => {
    const entry = sourceEntry(id);
    const result = await prepare(entry.file, entry.roots, null, verifyImage);
    const { image, hull } = result.project;
    return { image, name: hull.hullName, hullSize: hull.hullSize };
  });

  handle("ship-library-add", async (id) => {
    const source = id
      ? sourceEntry(id)
      : {
          file: await chooseFile("Choose a Starsector .ship file", ["ship"]),
          roots: [],
        };
    if (!source.file) return false;
    let prepared;
    try {
      prepared = await prepare(source.file, source.roots, null, verifyImage);
    } catch (error) {
      if (error.code !== "SPRITE_REQUIRED") throw error;
      const sprite = await chooseFile(error.message, ["png"]);
      if (!sprite) return false;
      prepared = await prepare(source.file, source.roots, sprite, verifyImage);
    }
    const result = await library.add(prepared);
    return { entry: summarize(result.entry), duplicate: result.duplicate };
  });
}

module.exports = { registerImportHandlers };
