const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{save:(name,text)=>ipcRenderer.invoke('save',{name,text}),exportPackage:(project,preview)=>ipcRenderer.invoke('export-package',{project,preview})});
