const {fileAction,revealSettings}=require('./studio-test-helpers.cjs');
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=process.env.AIM_OUTPUT||path.join(root,'test-results','aim-diagnosis');await fs.mkdir(out,{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});
 const records=[];
 try{
  const page=await app.firstWindow();await revealSettings(page);page.setDefaultTimeout(7000);page.on('dialog',d=>d.accept());await page.locator('[data-slot]').first().waitFor();
  await page.evaluate(()=>{
   window.aimTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','blur','focus'])window.addEventListener(type,e=>{
    if(type==='pointermove'&&!e.buttons)return;
    const target=e.target;window.aimTrace.push({type,time:performance.now(),target:target?.outerHTML?.slice(0,200),x:e.clientX,y:e.clientY,buttons:e.buttons,id:e.pointerId,angle:document.getElementById('angle').value,focus:document.hasFocus()});
   },true);
  });
  for(const mode of ['original','guarded'])for(let run=0;run<12;run++){
   await fileAction(page,'#example');await page.locator('#mountList button').filter({hasText:'ME01',exact:false}).click();
   await page.locator('#arc').fill('180');await page.locator('#arc').press('Tab');await page.locator('#undo').click();await page.locator('#redo').click();
   const marker=await page.locator('[data-slot="ME01"] > circle').boundingBox();await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);await page.mouse.down();await page.mouse.move(marker.x+23,marker.y-17,{steps:8});await page.mouse.up();
   await page.evaluate(()=>window.aimTrace=[]);
   if(mode==='guarded'){await page.bringToFront();await page.locator('[data-handle="aim"]').hover();}
   const aim=await page.locator('[data-handle="aim"]').boundingBox(),x=aim.x+aim.width/2,y=aim.y+aim.height/2;
   const pre=await page.evaluate(([x,y])=>({hit:document.elementFromPoint(x,y)?.outerHTML,focus:document.hasFocus(),angle:document.getElementById('angle').value}),[x,y]);
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(mode==='original'?aim.x+40:x+40,mode==='original'?aim.y+20:y+20,{steps:5});await page.mouse.up();
   const immediate=await page.locator('#angle').inputValue();await page.waitForTimeout(40);
   const after=await page.locator('#angle').inputValue(),trace=await page.evaluate(()=>window.aimTrace);
   records.push({mode,run,aim,pre,immediate,after,trace});
   if(after==='0')await page.screenshot({path:path.join(out,mode+'-'+run+'.png')});
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({executable:process.env.SHIPWRIGHT_EXECUTABLE||'source',records},null,2));
  assert.ok(records.filter(r=>r.mode==='guarded').every(r=>r.after!=='0'),'guarded committed aim drags must change angle; original-mode failures are retained as diagnostic observations');
  console.log(JSON.stringify(records.map(({mode,run,pre,immediate,after})=>({mode,run,hit:pre.hit?.match(/data-(?:handle|slot)="[^"]+"/)?.[0],immediate,after}))));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
