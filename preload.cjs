const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  workspaceRead: () => ipcRenderer.invoke('workspace-read'),
  workspaceWrite: value => ipcRenderer.invoke('workspace-write',value),
  batch: (items,mode) => ipcRenderer.invoke('batch',{items,mode}),
  onPrepareClose: callback => ipcRenderer.on('prepare-close',callback),
  closeReady: () => ipcRenderer.send('close-ready'),
  starsectorLocation: () => ipcRenderer.invoke("starsector-location"),
  chooseStarsectorLocation: () =>
    ipcRenderer.invoke("starsector-location-choose"),
  onAlreadyOpen: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("single-instance-notice", listener);
    return () => ipcRenderer.removeListener("single-instance-notice", listener);
  },
  libraryList: () => ipcRenderer.invoke("ship-library-list"),
  libraryGet: (id) => ipcRenderer.invoke("ship-library-get", id),
  scanShips: () => ipcRenderer.invoke("ship-source-scan"),
  previewShip: (id) => ipcRenderer.invoke("ship-source-preview", id),
  importShip: (id) => ipcRenderer.invoke("ship-library-add", id),
  save: (name, text) => ipcRenderer.invoke("save", { name, text }),
  exportPackage: (project, preview) =>
    ipcRenderer.invoke("export-package", { project, preview }),
});
