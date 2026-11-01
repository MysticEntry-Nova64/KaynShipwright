const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const app=await electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});const page=await app.firstWindow();page.on('dialog',d=>d.accept());page.setDefaultTimeout(8000);
 const input=page.locator('#fileInput');
 const upload=async(name,p)=>input.setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 try{
  await page.locator('[data-slot]').first().waitFor();const base=JSON.parse(await fs.readFile(path.join(root,'test-results','geometry.shipwright.json'),'utf8'));
  await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){if(this.name==='slow.shipwright.json')return new Promise(resolve=>{window.releaseSlowLoad=async()=>resolve(await original.call(this));});return original.call(this);};});
  await page.locator('#projectOpen').click({noWaitAfter:true});const slow=structuredClone(base);slow.hull.hullName='Old slow load';await upload('slow.shipwright.json',slow);
  const fresh=structuredClone(base);fresh.hull.hullName='Latest load';await upload('fast.shipwright.json',fresh);await page.locator('#name').filter({visible:true}).waitFor();await page.waitForFunction(()=>document.getElementById('name').value==='Latest load');await page.evaluate(()=>window.releaseSlowLoad());await page.waitForTimeout(40);assert.equal(await page.locator('#name').inputValue(),'Latest load');
  await upload('slow.shipwright.json',slow);await page.locator('#name').fill('Edit while loading');await page.locator('#name').press('Tab');await page.evaluate(()=>window.releaseSlowLoad());await page.waitForTimeout(40);assert.equal(await page.locator('#name').inputValue(),'Edit while loading');
  const malformed=structuredClone(base);malformed.hull.engineSlots=[null];await upload('bad.shipwright.json',malformed);await page.locator('#status').filter({hasText:'Import failed'}).waitFor();assert.equal(await page.locator('#name').inputValue(),'Edit while loading');
  // Verify an actual save failure preserves the current edit and prompts on replacement.
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>{throw Error('Injected save failure');};});await page.locator('#save').click();await page.locator('#status').filter({hasText:'Injected save failure'}).waitFor();assert.equal(await page.locator('#name').inputValue(),'Edit while loading');
  const savePath=path.join(root,'test-results','session-save.shipwright.json');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({filePath,canceled:false});},savePath);await page.locator('#save').click();await page.locator('#status').filter({hasText:'Project saved'}).waitFor();
  await page.locator('#name').fill('Temporary');await page.locator('#name').press('Tab');await page.locator('#undo').click();assert.equal(await page.locator('#name').inputValue(),'Edit while loading');let dialogs=0;page.on('dialog',()=>dialogs++);await page.locator('#example').click();await page.waitForFunction(()=>document.getElementById('name').value==='Verdant');assert.equal(dialogs,0,'undo to saved snapshot must be clean');
  await fs.writeFile(path.join(root,'test-results','session-ui.json'),JSON.stringify({passed:true,checks:['actual overlapping imports finish out of order','edit invalidates pending import','malformed import leaves document intact','native save failure preserves edit','undo to saved snapshot does not prompt']},null,2));console.log('Document session desktop failure/race checks passed.');
 }finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy()));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
