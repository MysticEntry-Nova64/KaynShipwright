const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 await fs.mkdir(output,{recursive:true});
 const executable=process.env.SHIPWRIGHT_EXECUTABLE;
 const app=await electron.launch(executable?{executablePath:executable,args:[],env}:{args:[root],env});
 const page=await app.firstWindow(),errors=[],checks=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(String(e)));
 let accept=true,dialogs=0;page.on('dialog',d=>{dialogs++;void (accept?d.accept():d.dismiss());});
 const projectFile=path.join(output,'audit-save.shipwright.json'),hullFile=path.join(output,'audit-export.ship');
 const configureSave=()=>app.evaluate(({dialog},files)=>{dialog.showSaveDialog=async(_win,options)=>({filePath:options.defaultPath.endsWith('.shipwright.json')?files.projectFile:files.hullFile,canceled:false});},{projectFile,hullFile});
 const clearStatus=()=>page.evaluate(()=>document.getElementById('status').textContent='Waiting for action');
 const save=async(keyboard=false)=>{await clearStatus();if(keyboard){await page.locator('#save').focus();await page.keyboard.press('Enter');}else await page.locator('#save').click();await page.locator('#status').filter({hasText:'saved'}).waitFor();return JSON.parse(await fs.readFile(projectFile,'utf8'));};
 const model=async()=>{await clearStatus();await page.locator('#export').click();await page.locator('#status').filter({hasText:'Layout exported'}).waitFor();return JSON.parse(await fs.readFile(hullFile,'utf8'));};
 const example=async()=>{await clearStatus();await page.locator('#example').click();await page.locator('#status').filter({hasText:'Loaded Verdant'}).waitFor();};
 const name=async value=>{await page.locator('#name').fill(value);await page.locator('#name').press('Tab');};
 const start=async selector=>{const b=await page.locator(selector).first().boundingBox();assert.ok(b,selector);await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+25,b.y+b.height/2+20,{steps:5});};
 try{
  await page.locator('[data-slot]').first().waitFor();await configureSave();
  if(executable)assert.equal(await app.evaluate(({app})=>app.getVersion()),require('../package.json').version);
  await name('Revision A');await save();await name('Revision B');await save();await page.locator('#undo').click();
  assert.equal((await save()).hull.hullName,'Revision A');assert.equal(await page.locator('#status').textContent(),'Project saved with embedded sprite.');
  await page.locator('#redo').click();accept=false;let beforeDialogs=dialogs;await page.locator('#example').click();assert.equal(dialogs,beforeDialogs+1);assert.equal(await page.locator('#name').inputValue(),'Revision B');accept=true;await example();
  checks.push('undo/save/redo tracks the actual disk revision and prompts before replacement');

  // All weapon gesture types must cancel without history by every cancellation route.
  for(const kind of ['move','aim','arc'])for(const cancellation of ['Escape','pointercancel','lostpointercapture']){
   await page.locator('#editTool').selectOption('weapons');await page.locator('#mountList button').filter({hasText:'ME01'}).click();
   const before=await model(),undoDisabled=await page.locator('#undo').isDisabled();
   await start(kind==='move'?'[data-slot="ME01"] > circle':`[data-handle="${kind}"]`);
   if(cancellation==='Escape')await page.keyboard.press('Escape');
   else await page.locator('#canvas').dispatchEvent(cancellation,{pointerId:1,pointerType:'mouse',bubbles:true});
   await page.mouse.up();assert.deepEqual(await model(),before,kind+' '+cancellation);assert.equal(await page.locator('#undo').isDisabled(),undoDisabled);
  }
  checks.push('weapon position/aim/arc restore on Escape, pointercancel and capture loss without history');

  for(const tool of ['engines','weapons']){
   await example();await page.locator('#editTool').selectOption(tool);const clean=await save();
   const selector=tool==='engines'?'[data-geometry="engine"][data-index="0"]':'[data-slot="ME01"] > circle';
   await start(selector);const saved=await save(true);await page.keyboard.press('Escape');await page.mouse.up();
   assert.notDeepEqual(saved.hull,clean.hull);assert.deepEqual(await model(),saved.hull,'Save commits gesture before snapshot');
   beforeDialogs=dialogs;await example();assert.equal(dialogs,beforeDialogs,'saved completed gesture remains clean');
   await page.locator('#editTool').selectOption(tool);const before=await model();await start(selector);await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await model(),before);
   await start(selector);await page.locator('#canvas').focus();await page.keyboard.press('Control+z');await page.mouse.up();assert.deepEqual(await model(),before,'Undo settles then reverses gesture');
   await start(selector);await page.evaluate(()=>{const select=document.getElementById('editTool');select.value='shield';select.dispatchEvent(new Event('change'));});await page.mouse.up();assert.deepEqual(await model(),before,'tool switch cancels');
   await page.locator('#editTool').selectOption(tool);await start(selector);await page.locator('#export').focus();await page.keyboard.press('Enter');await page.locator('#status').filter({hasText:'Layout exported'}).waitFor();await page.keyboard.press('Escape');await page.mouse.up();const exported=JSON.parse(await fs.readFile(hullFile,'utf8'));assert.deepEqual(await model(),exported,'export settles gesture');
   const packageParent=path.join(output,'audit-designs');await fs.mkdir(packageParent,{recursive:true});await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({filePaths:[folder],canceled:false});},packageParent);
   await start(selector);await clearStatus();await page.locator('#exportPackage').focus();await page.keyboard.press('Enter');await page.locator('#status').filter({hasText:'Design package exported:'}).waitFor();
   const packageFolder=(await page.locator('#status').textContent()).slice('Design package exported: '.length);await page.keyboard.press('Escape');await page.mouse.up();
   const packageProject=JSON.parse(await fs.readFile(path.join(packageFolder,'kayn_verdant.shipwright.json'),'utf8'));assert.notDeepEqual(packageProject.hull,exported);assert.deepEqual(await model(),packageProject.hull,'design package settles gesture');
   accept=false;beforeDialogs=dialogs;await page.locator('#example').click();assert.equal(dialogs,beforeDialogs+1,'package export does not mark the project saved');accept=true;
  }
  checks.push('weapon/engine Save, hull Export and design-package Export settle gestures; Undo reverses them; tool switch and Escape cancel; replacement protects unsaved exports');

  await example();await name('Previous good project');await save();const good=await fs.readFile(projectFile);
  await name('New working project');
  await app.evaluate(()=>{const fs=process.getBuiltinModule('node:fs/promises');global.auditOriginalWrite=fs.writeFile;fs.writeFile=async(file,bytes,...args)=>{await global.auditOriginalWrite(file,bytes.subarray(0,100),...args);throw Error('Injected partial write');};});
  try{await clearStatus();await page.locator('#save').click();await page.locator('#status').filter({hasText:'Injected partial write'}).waitFor();}
  finally{await app.evaluate(()=>{process.getBuiltinModule('node:fs/promises').writeFile=global.auditOriginalWrite;});}
  assert.deepEqual(await fs.readFile(projectFile),good,'previous native save survives partial write');assert.equal((await fs.readdir(output)).filter(n=>n.startsWith('.shipwright-save-')).length,0);
  accept=false;beforeDialogs=dialogs;await page.locator('#example').click();assert.equal(dialogs,beforeDialogs+1);assert.equal(await page.locator('#name').inputValue(),'New working project');accept=true;
  assert.equal((await save()).hull.hullName,'New working project');assert.deepEqual(errors,[]);
  checks.push('native partial-write failure preserves previous bytes, dirty state and owned-stage cleanup; retry succeeds');
  await fs.writeFile(path.join(output,executable?'audit-regressions-packaged.json':'audit-regressions.json'),JSON.stringify({passed:true,packaged:!!executable,checks,errors},null,2));console.log('Audit regressions passed:',checks);
 }finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy()));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
