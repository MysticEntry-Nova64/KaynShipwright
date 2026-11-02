const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

// Bounded lifecycle probe, not a universal leak guarantee. GC is diagnostic only.
(async()=>{
 const root=path.resolve(__dirname,'..');
 const out=path.resolve(process.env.SHIPWRIGHT_SOAK_OUTPUT||path.join(root,'test-results/release-soak'));
 await fs.mkdir(out,{recursive:true});
 const profile=await fs.mkdtemp(path.join(out,'profile-'));
 const env={...process.env,SHIPWRIGHT_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 let app,cdp;const errors=[],samples=[];const start=Date.now();
 try{
  app=await _electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.getElementById('count')?.textContent==='23');
  if(await page.locator('#locationDialog').isVisible())await page.locator('#locationLater').click();
  await page.locator('#mountList button').filter({hasText:'ME01'}).click();
  cdp=await page.context().newCDPSession(page);
  for(let batch=0;batch<7;batch++){
   for(let edit=0;edit<100;edit++){
    await page.locator('#arc').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));},edit%2?90:180);
    if(edit%10===0){
     await page.locator('#layoutMode').selectOption(edit%20?'studio':'focus');
     await page.locator('#reviewExport').click();await page.locator('#exportReviewClose').click();
    }
   }
   await page.locator('#workspaceState').filter({hasText:'up to date'}).waitFor();
   await cdp.send('HeapProfiler.collectGarbage');
   samples.push({completedEdits:(batch+1)*100,renderer:await cdp.send('Runtime.getHeapUsage'),dom:await cdp.send('Memory.getDOMCounters'),main:await app.evaluate(()=>({memory:process.memoryUsage(),resources:process.getActiveResourcesInfo()}))});
  }
  const warm=samples[0],last=samples.at(-1);
  assert.ok(last.dom.jsEventListeners<=warm.dom.jsEventListeners+30,'listeners accumulate after equivalent boundaries');
  assert.ok(last.dom.nodes<=warm.dom.nodes+300,'DOM nodes accumulate after equivalent boundaries');
  assert.ok(last.renderer.usedSize-warm.renderer.usedSize<8*1024*1024,'small fixed workspace exceeds 8MiB post-warmup heap-growth budget');
  await page.locator('#layoutMode').selectOption('studio');await page.setViewportSize({width:1080,height:720});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await page.locator('#closeDialog').waitFor();
  await page.locator('.close-intro img').evaluate(img=>img.decode());
  const box=await page.locator('#closeDialog').boundingBox();
  assert.ok(box.y>=0&&box.y+box.height<=720,'close dialog stays inside the minimum window');
  assert.equal(await page.locator('#closeKeepEditing').evaluate(e=>e===document.activeElement),true);
  await page.screenshot({path:path.join(out,'close-minimum.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('#closeDialog').isVisible(),false);
  await page.setViewportSize({width:1440,height:960});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await page.locator('#closeDialog').waitFor();await page.locator('.close-intro img').evaluate(img=>img.decode());
  await page.screenshot({path:path.join(out,'close-studio.png')});
  await page.locator('#closeKeepEditing').click();
  assert.deepEqual(errors,[]);
  const result={passed:true,version:await app.evaluate(({app})=>app.getVersion()),seconds:(Date.now()-start)/1000,edits:700,layoutSwitches:70,exportReviewCycles:70,samples,heapGrowthAfterWarmup:last.renderer.usedSize-warm.renderer.usedSize,errors,limits:'One fixed 23-mount workspace; forced diagnostic GC at seven boundaries. Does not prove absence of native, GPU, long-duration or arbitrary-input leaks.'};
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
 }finally{await cdp?.detach().catch(()=>{});await app?.evaluate(({app})=>app.exit(0)).catch(()=>{});await app?.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
