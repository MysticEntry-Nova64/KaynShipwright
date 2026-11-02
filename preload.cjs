const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{save:(name,text)=>ipcRenderer.invoke('save',{name,text})});
