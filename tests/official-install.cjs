const {_electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const exe=process.env.SHIPWRIGHT_EXECUTABLE,out=process.env.SHIPWRIGHT_INSTALL_OUTPUT;assert(exe&&out);
 await fs.mkdir(out,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.SHIPWRIGHT_USER_DATA;
 const normal=path.join(process.env.APPDATA,'Kayn Shipwright');
 const location=path.join(normal,'starsector-location.json');
 const hash=async file=>{try{return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
 const beforeLocation=await hash(location);const launches=[],errors=[];let app,page;
 async function launch(){
  app=await _electron.launch({executablePath:exe,args:[],env});page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  const info=await app.evaluate(({app})=>({name:app.getName(),version:app.getVersion(),profile:app.getPath('userData'),executable:app.getPath('exe'),pid:process.pid}));
  assert.equal(info.name,'Kayn Shipwright');assert.equal(info.version,'2.0.0');assert.equal(info.profile,normal);assert.equal(path.resolve(info.executable).toLowerCase(),path.resolve(exe).toLowerCase());launches.push(info);
  await page.waitForFunction(()=>document.getElementById('count')?.textContent==='23');
  if(await page.locator('#locationDialog').isVisible())await page.locator('#locationLater').click();
  assert.equal(await page.locator('#layoutMode').inputValue(),'studio');
 }
 async function recover(){
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await page.locator('#closeDialog').waitFor();await page.locator('.close-intro img').evaluate(img=>img.decode());
  assert.equal(await page.locator('#closeKeepEditing').evaluate(e=>e===document.activeElement),true);
  const closed=app.waitForEvent('close');await page.locator('#closeRecover').click();await closed;await app.close();app=undefined;
 }
 try{
  await launch();await page.screenshot({path:path.join(out,'installed-studio.png')});await recover();
  const first=JSON.parse(await fs.readFile(path.join(normal,'workspace-v1.json'),'utf8'));
  await launch();assert.equal(await page.locator('[data-drop-index]').count(),first.documents.length);await recover();
  const second=JSON.parse(await fs.readFile(path.join(normal,'workspace-v1.json'),'utf8'));assert.deepEqual(second,first);
  assert.equal(await hash(location),beforeLocation);assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,launches,normalProfile:true,normalRecoveryClose:true,restartWorkspaceEquality:true,locationPreserved:true,errors},null,2));
  console.log('Official installed 2.0.0: real default profile, two launches, themed recovery close, exact workspace restart equality and location preservation PASS.');
 }finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
