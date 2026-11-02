const {_electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=path.resolve(process.env.SHIPWRIGHT_DEMO_OUTPUT||path.join(root,'test-results/demo'));
 await fs.mkdir(dir,{recursive:true});const profile=await fs.mkdtemp(path.join(dir,'profile-'));
 const env={...process.env,SHIPWRIGHT_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app,page;const segments=[];let number=0;
 async function shot(frames,title,subtitle){await page.evaluate(()=>document.fonts.ready);const file=path.join(dir,`capture-${String(number++).padStart(4,'0')}.png`);await page.screenshot({path:file,animations:'disabled'});segments.push({file,frames,title,subtitle});}
 async function drag(selector,dx,dy,title,subtitle){const target=page.locator(selector).first();await target.hover();const b=await target.boundingBox();assert.ok(b,selector);const x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.down();for(let i=1;i<=18;i++){await page.mouse.move(x+dx*i/18,y+dy*i/18);await shot(1,title,subtitle);}await page.mouse.up();}
 async function change(name,value){const f=page.locator(`[data-field="${name}"]`);await f.fill(String(value));await f.press('Tab');}
 try{
  app=await _electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});
  page=await app.firstWindow();page.setDefaultTimeout(12000);await page.waitForFunction(()=>document.getElementById('count')?.textContent==='23');
  if(await page.locator('#locationDialog').isVisible())await page.locator('#locationLater').click();
  await page.setViewportSize({width:1440,height:960});await page.locator('#canvas image').first().evaluate(img=>new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=reject;i.src=img.getAttribute('href');}));
  await shot(30,'Shipwright 2.0.0 · A clearer place to build','Studio puts tools, your canvas and selected properties in one workspace.');
  await page.locator('#mountSearch').fill('ME01');await shot(24,'Find the mount you want','Search by ID, weapon category or mount size.');
  await page.locator('#mountList button:visible').click();await page.locator('#mountSearch').fill('');
  await shot(24,'Inspect the selection','Exact coordinates, direction and arc stay beside the canvas.');
  await drag('[data-slot="ME01"] > circle',25,12,'Move weapon mounts','Drag on the canvas; completed edits enter undo history.');
  await drag('[data-handle="aim"]',35,12,'Aim with direct feedback','The blue handle changes the selected mount’s direction.');
  await page.locator('#arc').fill('120');await page.locator('#arc').press('Tab');await shot(24,'Set a precise firing arc','Use exact fields alongside direct canvas editing.');
  await page.locator('#undo').click();await shot(12,'Undo and redo','Step back through completed edits.');await page.locator('#redo').click();await shot(12,'Undo and redo','Restore a change without losing your place.');
  await page.locator('#layoutMode').selectOption('focus');await shot(36,'Canvas focus · More room for the hull','Keep the inspector and use the compact mount picker above the canvas.');
  await page.locator('#focusMount').selectOption('ME02');await shot(18,'Same design, another view','Switch layout and selection while keeping edits and zoom.');
  await page.locator('#layoutMode').selectOption('studio');await page.locator('#editTool').selectOption('engines');await page.locator('[data-geometry="engine"][data-index="0"]').click();await change('Engine width',18);await shot(30,'Engine geometry','Edit width, position, exhaust direction, length and style.');
  await page.locator('#editTool').selectOption('shield');await page.locator('[data-geometry="shield"]').click();await change('Shield radius',120);await shot(30,'Shield geometry','Adjust the center and radius with handles or exact fields.');
  await page.locator('#editTool').selectOption('bounds');await page.locator('[data-geometry="vertex"][data-index="0"]').click();await shot(30,'Collision geometry','Inspect and move vertices; completed edits are validated.');
  await page.locator('#editTool').selectOption('weapons');await page.locator('#mountList button').filter({hasText:'ME01'}).click();
  const exports=path.join(dir,'exports');await fs.mkdir(exports,{recursive:true});
  await app.evaluate(({dialog},folder)=>{dialog.showSaveDialog=async(_w,o)=>({canceled:false,filePath:pathJoin(folder,o.defaultPath)});function pathJoin(a,b){return a+'/'+b;}dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},exports);
  await page.locator('#save').click();await page.locator('#status').filter({hasText:'Project saved'}).waitFor();await shot(24,'Save a project copy','Editable projects embed their sprite. Recovery and project files are separate.');
  await page.locator('#reviewExport').click();await shot(36,'Review before exporting','Choose the current design or all open designs, and check the output format.');
  await page.locator('#exportReviewContinue').click();await page.locator('#packageName').fill('Studio Demo');await page.locator('#packageVersion').fill('2.0.0');await shot(24,'Name the design pack','Package name and version belong to your export.');
  await page.locator('#packageConfirm').click();await page.locator('#status').filter({hasText:'Design package exported:'}).waitFor();
  const folder=(await page.locator('#status').textContent()).slice('Design package exported: '.length),manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));
  assert.equal(manifest.toolVersion,'2.0.0');for(const item of manifest.files)assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(folder,item.path))).digest('hex'),item.sha256);
  await shot(30,'Export an inspectable design pack','Projects, layouts, sprites, previews and a SHA-256 manifest.');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await page.locator('#closeDialog').waitFor();await page.locator('.close-intro img').evaluate(img=>img.decode());await shot(42,'Until next launch','Keep editing, close with recovery, or explicitly clear the workspace.');
  await page.locator('#closeKeepEditing').click();await shot(24,'Your workspace, ready for the next edit','Studio by default · Canvas focus when you want it · Shipwright 2.0.0');
  const frames=segments.reduce((n,s)=>n+s.frames,0);await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({version:'2.0.0',fps:15,frames,seconds:frames/15,segments,exportManifestChecked:true,actualPackagedApp:!!process.env.SHIPWRIGHT_EXECUTABLE},null,2));
  console.log(JSON.stringify({captures:number,frames,seconds:frames/15}));
 }catch(error){if(page)await page.screenshot({path:path.join(dir,'capture-failure.png')}).catch(()=>{});throw error;}
 finally{await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
