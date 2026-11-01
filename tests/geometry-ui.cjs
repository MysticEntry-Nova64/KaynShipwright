const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');await fs.mkdir(results,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({args:[process.env.SHIPWRIGHT_EXECUTABLE||root],env,...(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[]}: {})});
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 const tool=async value=>page.locator('#editTool').selectOption(value);
 const action=async(name)=>page.getByRole('menuitem',{name,exact:true}).click();
 const context=async(selector,position)=>{await page.locator(selector).click({button:'right',...(position?{position}: {})});};
 const field=name=>page.locator(`[data-field="${name}"]`);
 const change=async(name,value)=>{await field(name).fill(String(value));await field(name).press('Tab');};
 const drag=async(selector,dx,dy)=>{const b=await page.locator(selector).boundingBox();assert.ok(b,selector);await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:5});await page.mouse.up();};
 try{
  await page.locator('[data-slot]').first().waitFor();
  // All four switches are available regardless of the active tool.
  const choices=[['weapons','Weapons'],['shield','Shield'],['engines','Engines'],['bounds','Collision bounds']];
  for(const [start] of choices)for(const [destination,title] of choices){
   await tool(start);await context('#canvas',{x:100,y:100});
   for(const [,name] of choices)assert.equal(await page.getByRole('menuitem',{name,exact:true}).count(),1);
   assert.equal(await page.locator('#geometryMenu [aria-current="true"]').getAttribute('data-tool'),start);
   if(start==='bounds'&&destination==='bounds')await page.screenshot({path:path.join(results,'context-menu-tools.png')});
   await action(title);assert.equal(await page.locator('#editTool').inputValue(),destination);assert.equal(await page.locator('#geometryMenu').isVisible(),false);
  }
  assert.equal(await page.locator('[data-slot]').count(),23);
  await tool('bounds');assert.equal(await page.locator('[data-geometry="vertex"]').count(),24);
  await tool('engines');assert.equal(await page.locator('[data-geometry="engine"]').count(),2);
  await context('[data-geometry="engine"][data-index="0"]');await action('Mirror engine');assert.equal(await page.locator('[data-geometry="engine"]').count(),3);await page.locator('#undo').click();assert.equal(await page.locator('[data-geometry="engine"]').count(),2);await page.locator('#redo').click();assert.equal(await page.locator('[data-geometry="engine"]').count(),3);
  await context('[data-geometry="engine"][data-index="2"]');await action('Delete engine');assert.equal(await page.locator('[data-geometry="engine"]').count(),2);
  await context('#canvas',{x:180,y:180});await action('Add engine here');assert.equal(await page.locator('[data-geometry="engine"]').count(),3);
  await change('Engine width',18);assert.equal(await field('Engine width').inputValue(),'18');await change('Engine width',-2);assert.equal(await field('Engine width').inputValue(),'18');assert.match(await page.locator('#status').textContent(),/rejected/);
  await change('Engine style','LOW_TECH');await change('Exhaust direction °',180);await change('Exhaust length',30);
  const before=Number(await field('Forward').inputValue());await drag('[data-geometry="engine"][data-index="2"]',20,-10);assert.notEqual(Number(await field('Forward').inputValue()),before);
  await drag('[data-geometry="engineDirection"]',12,8);assert.notEqual(Number(await field('Exhaust direction °').inputValue()),180);
  const widthBefore=Number(await field('Engine width').inputValue());await drag('[data-geometry="engineWidth"]',9,0);assert.notEqual(Number(await field('Engine width').inputValue()),widthBefore);
  // A canceled gesture must restore the old coordinates and not create history.
  const engine=page.locator('[data-geometry="engine"][data-index="2"]'),box=await engine.boundingBox(),original=await field('Forward').inputValue();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+30,box.y+20);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await field('Forward').inputValue(),original);
  await context('[data-geometry="engine"][data-index="2"]');await action('Duplicate engine');assert.equal(await page.locator('[data-geometry="engine"]').count(),4);
  await tool('shield');await page.locator('[data-geometry="shield"]').click();await change('Shield radius',145);await drag('[data-geometry="shield"]',10,-10);const shieldForward=Number(await field('Shield forward').inputValue());assert.notEqual(shieldForward,18.75);await drag('[data-geometry="radius"]',-10,0);assert.notEqual(Number(await field('Shield radius').inputValue()),145);
  await context('#canvas',{x:250,y:200});await action('Set shield center here');assert.notEqual(Number(await field('Shield forward').inputValue()),shieldForward);
  await context('#canvas',{x:250,y:200});await action('Disable shield circle (radius 0)');assert.equal(await field('Shield radius').inputValue(),'0');await page.locator('#undo').click();
  await tool('bounds');const count=await page.locator('[data-geometry="vertex"]').count();assert.equal(count,24);
  await context('#canvas',{x:100,y:250});await action('Insert vertex on nearest edge');assert.equal(await page.locator('[data-geometry="vertex"]').count(),25);
  await context('[data-geometry="vertex"][data-index="0"]');await action('Delete vertex');assert.equal(await page.locator('[data-geometry="vertex"]').count(),24);await page.locator('#undo').click();assert.equal(await page.locator('[data-geometry="vertex"]').count(),25);
  await drag('[data-geometry="vertex"][data-index="0"]',0,-3);await page.locator('#undo').click();
  await context('#canvas',{x:100,y:150});await action('Select collision radius');await change('Collision radius',190);
  // Invalid three-point degeneracy cannot replace the document.
  await context('#canvas',{x:100,y:150});await action('Replace outline with sprite rectangle…');assert.equal(await page.locator('[data-geometry="vertex"]').count(),4);await page.locator('#undo').click();assert.equal(await page.locator('[data-geometry="vertex"]').count(),25);
  await context('#canvas',{x:100,y:150});await action('Clear outline…');assert.equal(await page.locator('[data-geometry="vertex"]').count(),0);await page.locator('#undo').click();
  const savePath=path.join(results,'geometry.shipwright.json');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({filePath,canceled:false});},savePath);await page.locator('#save').click();await page.locator('#status').filter({hasText:'Project saved'}).waitFor();
  const saved=JSON.parse(await fs.readFile(savePath,'utf8'));assert.equal(saved.hull.engineSlots.length,4);assert.equal(saved.hull.bounds.length/2,25);assert.equal(saved.hull.collisionRadius,190);
  await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({filePaths:[folder],canceled:false});},results);
  await page.locator('#exportPackage').click();await page.locator('#status').filter({hasText:'Design package exported:'}).waitFor();
  const status=await page.locator('#status').textContent(),folder=status.slice('Design package exported: '.length),manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));
  const expectedVersion=require('../package.json').version;assert.equal(manifest.toolVersion,expectedVersion);assert.ok(path.basename(folder).includes('-design-V'+expectedVersion+'-'));assert.ok((await fs.readFile(path.join(folder,'README.txt'),'utf8')).includes('Shipwright V'+expectedVersion));assert.equal(manifest.gameVerified,false);assert.equal(manifest.validation.errors.length,0);
  for(const item of manifest.files){const bytes=await fs.readFile(path.join(folder,item.path));assert.equal(bytes.length,item.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),item.sha256);}
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'data/hulls/kayn_verdant.ship'),'utf8')),saved.hull);
  const projectFile=path.join(folder,'kayn_verdant.shipwright.json');await page.locator('#projectOpen').click({noWaitAfter:true});await page.locator('#fileInput').setInputFiles(projectFile);await page.locator('#status').filter({hasText:'Loaded Verdant'}).waitFor();await tool('engines');assert.equal(await page.locator('[data-geometry="engine"]').count(),4);
  // Exercise actual asynchronous save ownership with a delayed native dialog.
  const delayed=path.join(results,'earlier-revision.shipwright.json');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=()=>new Promise(resolve=>{global.resolveShipwrightSave=()=>resolve({filePath,canceled:false});});},delayed);
  await page.locator('#save').click();await page.locator('#name').fill('Newer edit');await page.locator('#name').press('Tab');await app.evaluate(()=>global.resolveShipwrightSave());await page.locator('#status').filter({hasText:'current edits remain unsaved'}).waitFor();assert.equal(JSON.parse(await fs.readFile(delayed,'utf8')).hull.hullName,'Verdant');assert.equal(await page.locator('#name').inputValue(),'Newer edit');
  // Canceling a save must also preserve dirty state and the working document.
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await page.locator('#save').click();assert.equal(await page.locator('#name').inputValue(),'Newer edit');
  await page.locator('#name').fill('Verdant');await page.locator('#name').press('Tab');
  await page.screenshot({path:path.join(results,'geometry-engines.png')});await tool('shield');await page.screenshot({path:path.join(results,'geometry-shield.png')});await tool('bounds');await page.screenshot({path:path.join(results,'geometry-bounds.png')});
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(results,'geometry-ui.json'),JSON.stringify({passed:true,packaged:!!process.env.SHIPWRIGHT_EXECUTABLE,packageFolder:folder,checks:['all four tools in every context menu; all 16 switches preserve geometry','engine add/mirror/duplicate/delete','engine drag position/direction/width','engine numerical fields/rejected width','canceled gesture','shield center/radius/context actions','outline insert/delete/drag/reset/clear','collision radius','undo/redo','package hashes/readback','export/reopen','actual delayed save during edit','save cancellation'],errors},null,2));console.log('Geometry desktop workflow passed; package:',folder);
 }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
