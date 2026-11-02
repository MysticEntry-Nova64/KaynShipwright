const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const { registerImportHandlers } = require("./native/import-ipc.cjs");
if (process.env.SHIPWRIGHT_USER_DATA)
  app.setPath("userData", process.env.SHIPWRIGHT_USER_DATA);
const { saveFile } = require("./save-service.cjs");
let win;
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#10171b",
    title: "Kayn Shipwright V1.1.0",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("will-prevent-unload", (e) => {
    const response = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Keep editing", "Discard changes"],
      defaultId: 0,
      cancelId: 0,
      message: "Close without saving this project?",
    });
    if (response === 1) e.preventDefault();
  });
  registerImportHandlers({
    ipcMain,
    dialog,
    nativeImage: require("electron").nativeImage,
    window: win,
    directory: path.join(app.getPath("userData"), "imported-ships"),
  });
  win.loadFile("index.html");
});
ipcMain.handle("save", async (event, { name, text }) => {
  if (
    event.sender !== win.webContents ||
    typeof text !== "string" ||
    text.length > 50_000_000 ||
    typeof name !== "string" ||
    !/^[-\w.]+$/.test(name)
  )
    throw Error("Invalid save request");
  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath: name,
  });
  if (canceled) return false;
  return saveFile(filePath, text);
});
app.on("window-all-closed", () => app.quit());

ipcMain.handle("export-package", async (event, payload) => {
  if (event.sender !== win.webContents) throw Error("Invalid sender");
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose a parent folder for the design package",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled) return false;
  return require("./package-service.cjs").exportPackage(
    filePaths[0],
    payload.project,
    payload.preview,
  );
});
