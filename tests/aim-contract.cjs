const {_electron:electron}=require('playwright');const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.AIM_OUTPUT||path.join(root,'test-results','aim-contract');await fs.mkdir(out,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const executable=process.env.SHIPWRIGHT_EXECUTABLE;const app=await electron.launch(executable?{executablePath:executable,args:[],env}:{args:[root],env});const checks=[];
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(7000);page.on('dialog',d=>d.accept());await page.locator('[data-slot]').first().waitFor();await page.bringToFront();
  const dest=path.join(out,'observed.ship');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({filePath:file,canceled:false});},dest);
  const reset=async()=>{await page.locator('#example').click();await page.locator('#mountList button').filter({hasText:'ME01'}).click();assert.equal(await page.locator('#angle').inputValue(),'0');};
  const start=async()=>{await page.locator('[data-handle="aim"]').hover();const b=await page.locator('[data-handle="aim"]').boundingBox();await page.mouse.down();return b;};
  const model=async()=>{await page.locator('#export').click();await page.locator('#status').filter({hasText:'Layout exported'}).waitFor();return JSON.parse(await fs.readFile(dest,'utf8'));};
  await reset();await start();const mount=await page.locator('[data-slot="ME01"] > circle').boundingBox();await page.mouse.move(mount.x+mount.width/2+60,mount.y+mount.height/2,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>document.getElementById('angle').value==='-90');assert.equal((await model()).weaponSlots.find(s=>s.id==='ME01').angle,-90);checks.push('physical rightward endpoint yields -90 degrees in inspector and exported model');
  await page.locator('#undo').click();assert.equal(await page.locator('#angle').inputValue(),'0');await page.locator('#redo').click();assert.equal(await page.locator('#angle').inputValue(),'-90');checks.push('Undo and Redo preserve committed angle');
  for(const cancel of ['Escape','pointercancel','blur']){
   await reset();const b=await start();await page.mouse.move(b.x+40,b.y+20,{steps:5});
   if(cancel==='Escape')await page.keyboard.press('Escape');else if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));else await page.locator('#canvas').dispatchEvent('pointercancel',{pointerId:1});
   await page.mouse.up();assert.equal(await page.locator('#angle').inputValue(),'0');assert.equal((await model()).weaponSlots.find(s=>s.id==='ME01').angle,0);checks.push(cancel+' cancels preview and preserves model');
  }
  await reset();const old=await page.locator('[data-handle="aim"]').boundingBox();await page.locator('#angle').fill('90');await page.locator('#angle').press('Tab');
  const hit=await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.getAttribute('data-handle'),[old.x+old.width/2,old.y+old.height/2]);assert.notEqual(hit,'aim');
  await page.mouse.move(old.x+old.width/2,old.y+old.height/2);await page.mouse.down();await page.mouse.move(old.x+40,old.y+20,{steps:5});await page.mouse.up();assert.equal((await model()).weaponSlots.find(s=>s.id==='ME01').angle,90);checks.push('deliberately stale handle coordinates miss; original angle remains90 as expected');
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({executable:executable||'source',checks},null,2));console.log(checks);
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
