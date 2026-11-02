const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
if (process.env.SHIPWRIGHT_USER_DATA)
  app.setPath("userData", process.env.SHIPWRIGHT_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const { saveFile } = require("./save-service.cjs");
  const { registerImportHandlers } = require("./native/import-ipc.cjs");
  const { createLocationStore } = require("./native/location-service.cjs");
  let win;
  let workspaceStore;
  let closingReady=false;
  const batchFolders = {};
  let pendingInstanceNotice = false;
  function activatePrimary() {
    pendingInstanceNotice = true;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (!win.webContents.isLoadingMainFrame()) {
      win.webContents.send("single-instance-notice");
      pendingInstanceNotice = false;
    }
  }
  app.on("second-instance", activatePrimary);
  app.whenReady().then(() => {
    win = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 1080,
      minHeight: 720,
      backgroundColor: "#10171b",
      title: `Kayn Shipwright V${app.getVersion()}`,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    workspaceStore = require('./native/workspace-service.cjs').createWorkspaceStore(app.getPath('userData'));
    win.on('close', event => { if (!closingReady) { event.preventDefault(); win.webContents.send('prepare-close'); } });
    win.setMenuBarVisibility(false);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.on("will-prevent-unload", (e) => {
      const response = dialog.showMessageBoxSync(win, {
        type: "question",
        buttons: ["Keep editing", "Close with recovery"],
        defaultId: 0,
        cancelId: 0,
        message: "Close with unsaved projects? Workspace recovery keeps the latest successfully stored drafts. Save project files for a durable copy.",
      });
      if (response === 1) e.preventDefault();
    });
    let candidates;
    if (process.env.SHIPWRIGHT_LOCATION_CANDIDATES) {
      candidates = JSON.parse(process.env.SHIPWRIGHT_LOCATION_CANDIDATES);
      if (
        !Array.isArray(candidates) ||
        candidates.some((p) => typeof p !== "string" || !path.isAbsolute(p))
      )
        throw Error("Invalid location candidates");
    }
    const locationStore = createLocationStore(
      app.getPath("userData"),
      candidates,
    );
    win.webContents.once("did-finish-load", () => {
      if (pendingInstanceNotice) activatePrimary();
    });
    registerImportHandlers({
      locationStore,
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
  ipcMain.handle('workspace-read', event => {if(event.sender!==win.webContents)throw Error('Invalid sender');return workspaceStore.read();});
  ipcMain.handle('workspace-write', (event,value) => {if(event.sender!==win.webContents)throw Error('Invalid sender');return workspaceStore.write(value);});
  ipcMain.on('close-ready', event => {if(event.sender===win.webContents){closingReady=true;win.close();closingReady=false;}});
  ipcMain.handle('batch',async(event,{items,mode,metadata})=>{
    if(event.sender!==win.webContents)throw Error('Invalid sender');
    const {preflight,runBatch}=require('./native/workspace-service.cjs');preflight(items,mode);if(mode==='package')require('./package-service.cjs').buildDesignPack(items,metadata);
    let parent=batchFolders[mode];
    if(!parent){const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:mode==='save'?'Choose a folder for all editable projects (matching IDs will be replaced)':'Choose a folder for all exported designs',properties:['openDirectory','createDirectory']});if(canceled)return false;parent=filePaths[0];
      if(mode!=='package'){const fs=require('node:fs/promises');const existing=[];for(const item of items){const file=path.join(parent,item.project.hull.hullId+(mode==='save'?'.shipwright.json':'.ship'));try{await fs.access(file);existing.push(path.basename(file));}catch(e){if(e.code!=='ENOENT')throw e;}}if(existing.length){const answer=await dialog.showMessageBox(win,{type:'question',buttons:['Cancel','Replace matching files'],defaultId:0,cancelId:0,message:'Replace existing files?',detail:existing.join('\n')});if(answer.response!==1)return false;}}
      batchFolders[mode]=parent;
    }
    return {results:await runBatch(parent,items,mode,metadata),directory:parent};
  });
  app.on("window-all-closed", () => app.quit());

  ipcMain.handle("export-package", async (event, payload) => {
    if (event.sender !== win.webContents) throw Error("Invalid sender");
    require('./package-service.cjs').buildDesignPack([{project:payload.project,preview:payload.preview}],payload.metadata);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: "Choose a parent folder for the design package",
      properties: ["openDirectory", "createDirectory"],
    });
    if (canceled) return false;
    return require("./package-service.cjs").exportPackage(
      filePaths[0],
      payload.project,
      payload.preview,
      payload.metadata,
    );
  });
}
