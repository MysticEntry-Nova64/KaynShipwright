const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results','scaling');await fs.mkdir(out,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('dialog',d=>d.accept());
  await page.locator('[data-slot]').first().waitFor();
  const dest=path.join(out,'export.ship');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({filePath:file,canceled:false});},dest);
  const exported=async()=>{await page.evaluate(()=>document.getElementById('status').textContent='waiting');await page.locator('#export').click();await page.locator('#status').filter({hasText:'Layout exported'}).waitFor();return JSON.parse(await fs.readFile(dest,'utf8'));};
  const before=await exported();await page.locator('#scale').fill('2');await page.locator('#resize').click();
  assert.match(await page.locator('#status').textContent(),/Scaled hull/);const scaled=await exported();assert.equal(scaled.width,before.width*2);
  await page.locator('#undo').click();assert.deepEqual(await exported(),before);
  const project={version:1,image:'data:image/png;base64,AA==',hull:{...before,bounds:[0,0,1e153,0,1e153,1e153,0,1e153]}};
  const file=path.join(out,'large.ship');await fs.writeFile(file,JSON.stringify(project.hull));
  const chooser=page.waitForEvent('filechooser');await page.locator('#importShip').click();await (await chooser).setFiles(file);await page.locator('#status').filter({hasText:'Layout imported'}).waitFor();
  const large=await exported();await page.locator('#scale').fill('10');await page.locator('#resize').click();
  assert.match(await page.locator('#status').textContent(),/overflow/);assert.deepEqual(await exported(),large);
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({normalScale:true,undo:true,polygonOverflowRejected:true,originalExportPreserved:true}));
  console.log('Scaling UI: normal scale, undo, polygon overflow rejection and preserved export passed.');
 }finally{await app.evaluate(({app})=>{app.exit(0);}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
