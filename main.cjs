const {app,BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path');
const {scan,prepare,createLibrary}=require('./import-service.cjs');
if(process.env.SHIPWRIGHT_USER_DATA)app.setPath('userData',process.env.SHIPWRIGHT_USER_DATA);
let library,catalog=new Map();
const summary=e=>({id:e.id,name:e.project.hull.hullName,hullId:e.project.hull.hullId,hullSize:e.project.hull.hullSize,source:e.sourceName,createdUTC:e.createdUTC});
const checkSender=event=>{if(event.sender!==win.webContents)throw Error('Invalid sender');};
const verifyImage=bytes=>{const image=require('electron').nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('Sprite PNG could not be decoded.');};
const {saveFile}=require('./save-service.cjs');
let win;
app.whenReady().then(()=>{library=createLibrary(path.join(app.getPath('userData'),'imported-ships'));win=new BrowserWindow({width:1440,height:960,minWidth:1080,minHeight:720,backgroundColor:'#10171b',title:'Kayn Shipwright V1.1.0',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-prevent-unload',e=>{const response=dialog.showMessageBoxSync(win,{type:'question',buttons:['Keep editing','Discard changes'],defaultId:0,cancelId:0,message:'Close without saving this project?'});if(response===1)e.preventDefault();});win.loadFile('index.html');});
ipcMain.handle('save',async(event,{name,text})=>{if(event.sender!==win.webContents||typeof text!=='string'||text.length>50_000_000||typeof name!=='string'||!/^[-\w.]+$/.test(name))throw Error('Invalid save request');const {filePath,canceled}=await dialog.showSaveDialog(win,{defaultPath:name});if(canceled)return false;return saveFile(filePath,text);});
app.on('window-all-closed',()=>app.quit());

ipcMain.handle('export-package',async(event,payload)=>{if(event.sender!==win.webContents)throw Error('Invalid sender');const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:'Choose a parent folder for the design package',properties:['openDirectory','createDirectory']});if(canceled)return false;return require('./package-service.cjs').exportPackage(filePaths[0],payload.project,payload.preview);});

// Game inputs are read-only. The only import writes are owned library entries.
ipcMain.handle('ship-library-list',async event=>{checkSender(event);const result=await library.list();return {entries:result.entries.map(summary),warnings:result.warnings};});
ipcMain.handle('ship-library-get',async(event,id)=>{checkSender(event);return (await library.get(id)).project;});
ipcMain.handle('ship-source-scan',async event=>{checkSender(event);const choice=await dialog.showOpenDialog(win,{title:'Choose Starsector installation or mod folder',properties:['openDirectory']});if(choice.canceled)return false;const entries=await scan(choice.filePaths[0]);catalog=new Map(entries.map(e=>[e.id,e]));return entries.map(({file,roots,...entry})=>entry);});
ipcMain.handle('ship-source-preview',async(event,id)=>{checkSender(event);const entry=catalog.get(id);if(!entry)throw Error('Select a ship from the current source list.');const result=await prepare(entry.file,entry.roots,null,verifyImage);return {image:result.project.image,name:result.project.hull.hullName,hullSize:result.project.hull.hullSize};});
ipcMain.handle('ship-library-add',async(event,id)=>{checkSender(event);let file,roots=[];
 if(id){const entry=catalog.get(id);if(!entry)throw Error('Select a ship from the current source list.');file=entry.file;roots=entry.roots;}
 else{const choice=await dialog.showOpenDialog(win,{title:'Choose a Starsector .ship file',filters:[{name:'Ship layout',extensions:['ship']}],properties:['openFile']});if(choice.canceled)return false;file=choice.filePaths[0];}
 let prepared;try{prepared=await prepare(file,roots,null,verifyImage);}catch(error){if(error.code!=='SPRITE_REQUIRED')throw error;const choice=await dialog.showOpenDialog(win,{title:error.message,filters:[{name:'Matching sprite',extensions:['png']}],properties:['openFile']});if(choice.canceled)return false;prepared=await prepare(file,roots,choice.filePaths[0],verifyImage);}
 const result=await library.add(prepared);return {entry:summary(result.entry),duplicate:result.duplicate};
});
