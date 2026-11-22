import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

test('hidden smoke is opt-in, requires a separate absolute profile and never focuses its window', () => {
 const code=fs.readFileSync(new URL('../main.cjs',import.meta.url),'utf8');
 const appData=path.join(os.tmpdir(),'shipwright-guard-appdata'),normal=path.join(appData,'Kayn Shipwright'),isolated=path.join(os.tmpdir(),'shipwright-owned-smoke');
 function run(env:Record<string,string>){
  const events=new Map<string,()=>void>(),calls:string[]=[];let ready:()=>void=()=>{},options:any,profile='',exitCode:number|undefined;
  const exited={};
  const app={setName(){},getVersion(){return '2.0.1';},getPath(){return appData;},setPath(_:string,value:string){profile=value;calls.push('setPath');},requestSingleInstanceLock(){calls.push('lock');return true;},quit(){},whenReady(){return {then(fn:()=>void){ready=fn;}};},on(name:string,fn:()=>void){events.set(name,fn);}};
  class Window{
   webContents={send(){},isLoadingMainFrame(){return false;},setWindowOpenHandler(){},on(){},once(){}};
   constructor(value:any){options=value;calls.push('window');}
   on(){}setMenuBarVisibility(){}loadFile(){}isDestroyed(){return false;}isMinimized(){return true;}
   restore(){calls.push('restore');}show(){calls.push('show');}focus(){calls.push('focus');}
  }
  const electron={app,BrowserWindow:Window,ipcMain:{handle(){},on(){}},dialog:{},nativeImage:{}};
  const requireFake=(name:string)=>{
   if(name==='electron')return electron;if(name==='node:path')return path;
   if(name==='./save-service.cjs')return {saveFile(){}};
   if(name==='./native/import-ipc.cjs')return {registerImportHandlers(){}};
   if(name==='./native/location-service.cjs')return {createLocationStore(){return {};}};
   if(name==='./native/workspace-service.cjs')return {createWorkspaceStore(){return {};}};
   throw Error('Unexpected boundary: '+name);
  };
  try{vm.runInNewContext(code,{require:requireFake,__dirname:fileURLToPath(new URL('..',import.meta.url)),process:{env,stderr:{write(){}},exit(value:number){exitCode=value;throw exited;}},console});ready();events.get('second-instance')?.();}
  catch(error){if(error!==exited)throw error;}
  return {calls,options,profile,exitCode};
 }
 for(const env of [{},{SHIPWRIGHT_TEST_HIDDEN:'0'},{SHIPWRIGHT_TEST_HIDDEN:'yes'}]){
  const r=run(env);assert.equal(r.options.show,true);assert.equal(r.profile,normal);assert.ok(r.calls.includes('show')&&r.calls.includes('focus')&&r.calls.includes('restore'));
 }
 for(const override of [undefined,'relative-profile',normal,path.join(normal,'..','Kayn Shipwright')]){
  const env:Record<string,string>={SHIPWRIGHT_TEST_HIDDEN:'1'};if(override!==undefined)env.SHIPWRIGHT_USER_DATA=override;
  const r=run(env);assert.equal(r.exitCode,64);assert.deepEqual(r.calls,[],'invalid mode exits before profile/lock/window');
 }
 const r=run({SHIPWRIGHT_TEST_HIDDEN:'1',SHIPWRIGHT_USER_DATA:isolated});
 assert.equal(r.options.show,false);assert.equal(r.profile,isolated);assert.ok(r.calls.includes('window'));assert.ok(!r.calls.some(x=>['show','focus','restore'].includes(x)));
});

