const {fileAction,revealSettings}=require('./studio-test-helpers.cjs');
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.SHIPWRIGHT_DROP_OUTPUT||path.join(root,'test-results','drops');await fs.mkdir(out,{recursive:true});
 const manifest=process.env.SHIPWRIGHT_DROP_DESIGNS?JSON.parse(await fs.readFile(process.env.SHIPWRIGHT_DROP_DESIGNS,'utf8')):['frigate','destroyer','cruiser','capital'].map((cls,i)=>({id:'fixture_'+cls,name:'Fixture '+cls,class:cls==='capital'?'CAPITAL_SHIP':cls.toUpperCase(),height:[160,240,320,480][i],file:path.join(root,'assets/verdant.png')}));
 const files=await Promise.all(manifest.map(async d=>({name:d.id+'.png',data:(await fs.readFile(d.file)).toString('base64')})));
 const keep=process.env.SHIPWRIGHT_DROP_KEEP_OPEN==='1',env={...process.env};delete env.ELECTRON_RUN_AS_NODE;if(!keep)env.SHIPWRIGHT_USER_DATA=path.join(out,'profile');
 const app=await electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});const page=await app.firstWindow();await revealSettings(page);page.setDefaultTimeout(30000);const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 let success=false;
 async function drop(items,target='header'){
  const dt=await page.evaluateHandle(items=>{const dt=new DataTransfer();for(const item of items){const raw=atob(item.data),b=new Uint8Array(raw.length);for(let i=0;i<b.length;i++)b[i]=raw.charCodeAt(i);dt.items.add(new File([b],item.name,{type:'image/png'}));}return dt;},items);
  await page.locator(target).dispatchEvent('drop',{dataTransfer:dt});await dt.dispose();
 }
 try{
  await page.locator('#count').filter({hasText:'23'}).waitFor();await page.bringToFront();
  await app.evaluate(({dialog})=>{globalThis.__dropSave=dialog.showSaveDialog;globalThis.__dropClose=dialog.showMessageBoxSync;dialog.showMessageBoxSync=()=>1;});
  const projectsDir=process.env.SHIPWRIGHT_DESIGN_SAVE_DIR||path.join(out,'projects');await fs.mkdir(projectsDir,{recursive:true});
  await app.evaluate(({dialog},dir)=>{dialog.showSaveDialog=async(_window,options)=>({canceled:false,filePath:dir+'/'+options.defaultPath});},projectsDir);
  await drop(files);await page.locator('[data-drop-index]').nth(4).waitFor();assert.equal(await page.locator('[data-drop-index]').count(),5);checks.push('four actual PNG byte payloads dropped together on header outside canvas; no picker');
  const exports=[];
  for(let i=0;i<4;i++){
   await page.locator(`[data-drop-index="${i+1}"]`).click();assert.equal(await page.locator('#class').inputValue(),manifest[i].class);
   await page.locator('#name').fill(manifest[i].name);await page.locator('#name').press('Tab');
   await page.locator('#save').click();await page.locator('#status').filter({hasText:'Project saved'}).waitFor();
   if(i===0)assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),true,'unsaved inactive drafts still protect closing');
   await fileAction(page,'#export');await page.locator('#status').filter({hasText:'Layout exported'}).waitFor();
   const project=JSON.parse(await fs.readFile(path.join(projectsDir,manifest[i].id+'.shipwright.json'),'utf8')),hull=JSON.parse(await fs.readFile(path.join(projectsDir,manifest[i].id+'.ship'),'utf8'));
   assert.equal(hull.hullSize,manifest[i].class);assert.ok(Math.abs(hull.height-manifest[i].height)<1e-6);assert.equal(project.hull.hullName,manifest[i].name);assert.equal(crypto.createHash('sha256').update(Buffer.from(project.image.split(',')[1],'base64')).digest('hex'),crypto.createHash('sha256').update(Buffer.from(files[i].data,'base64')).digest('hex'));
   await page.screenshot({path:path.join(out,manifest[i].id+'.png')});exports.push({id:hull.hullId,class:hull.hullSize,width:hull.width,height:hull.height,project:path.join(projectsDir,manifest[i].id+'.shipwright.json')});
  }
  assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;}),false,'all saved drafts allow closing');checks.push('inactive unsaved draft close guard and clean all-saved state');
  await page.locator('[data-drop-index="1"]').click();assert.equal(await page.locator('#name').inputValue(),manifest[0].name);await page.locator('#name').fill('Retained draft');await page.locator('#name').press('Tab');await page.locator('[data-drop-index="2"]').click();await page.locator('[data-drop-index="1"]').click();assert.equal(await page.locator('#name').inputValue(),'Retained draft');checks.push('name edits retained when switching drafts; all four classes/sizes exported with original clean PNG bytes');
  await drop([files[1],{name:'invalid.png',data:Buffer.from('not png').toString('base64')}]);await page.locator('#status').filter({hasText:'Drop failed: Error: Invalid PNG'}).waitFor();assert.equal(await page.locator('[data-drop-index]').count(),5);assert.equal(await page.locator('#name').inputValue(),'Retained draft');checks.push('mixed valid/corrupt PNG batch fails atomically without losing current edits');
  await drop(Array.from({length:17},(_,i)=>({...files[0],name:'too_many_'+i+'.png'})));await page.locator('#status').filter({hasText:'at most 16'}).waitFor();assert.equal(await page.locator('[data-drop-index]').count(),5);checks.push('oversized file count rejected');
  await page.evaluate(()=>{window.__originalDropReader=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(blob){window.__pendingDropReader=()=>window.__originalDropReader.call(this,blob);};});
  await drop([{...files[0],name:'stale_frigate.png'}]);await page.waitForFunction(()=>!!window.__pendingDropReader);await page.locator('#name').fill('Changed during pending drop');await page.locator('#name').press('Tab');
  await page.evaluate(()=>{FileReader.prototype.readAsDataURL=window.__originalDropReader;window.__pendingDropReader();delete window.__originalDropReader;delete window.__pendingDropReader;});await page.waitForTimeout(300);assert.equal(await page.locator('[data-drop-index]').count(),5);assert.equal(await page.locator('#name').inputValue(),'Changed during pending drop');checks.push('late PNG decode cannot replace a revision edited while loading');
  await page.locator('#name').fill(manifest[0].name);await page.locator('#name').press('Tab');await page.locator('#save').click();await page.locator('#status').filter({hasText:'Project saved'}).waitFor();
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=globalThis.__dropSave;dialog.showMessageBoxSync=globalThis.__dropClose;delete globalThis.__dropSave;delete globalThis.__dropClose;});
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,'four-designs-in-editor.png')});await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,packaged:!!process.env.SHIPWRIGHT_EXECUTABLE,checks,exports,errors,osExplorerDragTested:false,eventRoute:'DataTransfer/File drop event through actual renderer UI',process:app.process().pid},null,2));success=true;console.log('PASS batch drop, draft retention, real UI save/export, atomic failures, count limit and stale decode; '+out);
  if(keep){console.log('EDITOR_LEFT_OPEN pid='+app.process().pid);await new Promise(resolve=>app.on('close',resolve));}
 }catch(error){console.error("UI STATUS:",await page.locator("#status").textContent().catch(()=>"unavailable"));await page.screenshot({path:path.join(out,"failure.png")}).catch(()=>{});throw error;}finally{if(!keep||!success){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
})().catch(e=>{console.error(e);process.exitCode=1;});
