const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');await fs.mkdir(path.join(root,'test-results'),{recursive:true});
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch(process.env.SHIPWRIGHT_EXECUTABLE?{executablePath:process.env.SHIPWRIGHT_EXECUTABLE,args:[],env}:{args:[root],env});
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
 page.on('dialog',d=>d.accept());
 let attemptedGesture=null;
 try{
 await page.bringToFront();await page.locator('#count').filter({hasText:'23'}).waitFor();
 assert.equal(await page.locator('[data-slot]').count(),23);
 await page.locator('[data-slot="ME01"] > circle').click();
 await page.locator('#arc').fill('180');await page.locator('#arc').press('Tab');assert.equal(await page.locator('#arc').inputValue(),'180');
 await page.locator('#undo').click();assert.equal(await page.locator('#arc').inputValue(),'240');
 await page.locator('#redo').click();assert.equal(await page.locator('#arc').inputValue(),'180');
 const marker=await page.locator('[data-slot="ME01"] > circle').boundingBox();const before=Number(await page.locator('#forward').inputValue());
 await page.mouse.move(marker.x+marker.width/2,marker.y+marker.height/2);await page.mouse.down();await page.mouse.move(marker.x+23,marker.y-17,{steps:8});await page.mouse.up();assert.notEqual(Number(await page.locator('#forward').inputValue()),before);
 await page.locator('[data-handle="aim"]').hover();const aim=await page.locator('[data-handle="aim"]').boundingBox();attemptedGesture={kind:'aim',box:aim,expected:'Direction changes from 0 after a committed aim drag'};assert.equal(await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.getAttribute('data-handle'),[aim.x+aim.width/2,aim.y+aim.height/2]),'aim','drag starts on intended handle');await page.mouse.down();await page.mouse.move(aim.x+aim.width/2+40,aim.y+aim.height/2+20,{steps:5});await page.mouse.up();await page.waitForFunction(([id,value])=>Number(document.getElementById(id).value)!==value,['angle',0]);
 await page.locator('[data-handle="arc"]').hover();const arc=await page.locator('[data-handle="arc"]').boundingBox();attemptedGesture={kind:'arc',box:arc,expected:'Arc changes from 180 after a committed arc drag'};assert.equal(await page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.getAttribute('data-handle'),[arc.x+arc.width/2,arc.y+arc.height/2]),'arc','drag starts on intended handle');await page.mouse.down();await page.mouse.move(arc.x+arc.width/2+25,arc.y+arc.height/2+20,{steps:5});await page.mouse.up();await page.waitForFunction(([id,value])=>Number(document.getElementById(id).value)!==value,['arc',180]);
 await page.locator('#mirror').click();assert.equal(await page.locator('[data-slot]').count(),24);await page.locator('#delete').click();assert.equal(await page.locator('[data-slot]').count(),23);
 await page.locator('#add').click();await page.locator('#canvas').click({position:{x:90,y:110}});assert.equal(await page.locator('[data-slot]').count(),25);await page.locator('#undo').click();assert.equal(await page.locator('[data-slot]').count(),23);await page.locator('#add').click();
 await page.locator('#showShield').check();await page.locator('#zoomIn').click();assert.equal(await page.locator('#zoomLabel').textContent(),'125%');await page.locator('#fit').click();
 await page.locator('#example').click();await page.locator('#count').filter({hasText:'23'}).waitFor();
 const exportPath=path.join(root,'test-results','roundtrip.ship');
 await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({filePath,canceled:false});},exportPath);
 await page.locator('#export').click();await page.locator('#status').filter({hasText:'Layout exported'}).waitFor();assert.deepEqual(JSON.parse(await fs.readFile(exportPath,'utf8')),JSON.parse(await fs.readFile(path.join(root,'assets/verdant.ship'),'utf8')));
 const projectPath=path.join(root,'test-results','saved.shipwright.json');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({filePath,canceled:false});},projectPath);
 await page.locator('#save').click();await page.locator('#status').filter({hasText:'Project saved'}).waitFor();assert.equal(JSON.parse(await fs.readFile(projectPath,'utf8')).hull.weaponSlots.length,23);
 await page.locator('#imageOpen').click({noWaitAfter:true});
 // Use the native input to exercise the same PNG import path as drag-and-drop.
 await page.locator('#fileInput').setInputFiles(path.join(root,'assets/verdant.png'));await page.locator('#count').filter({hasText:/^0$/}).waitFor();
 await page.locator('#projectOpen').click({noWaitAfter:true});await page.locator('#fileInput').setInputFiles(projectPath);await page.locator('#count').filter({hasText:'23'}).waitFor();
 await page.locator('#scale').fill('1.2');await page.locator('#resize').click();assert.match(await page.locator('#dimensions').textContent(),/288 × 432/);await page.locator('#undo').click();
 const png=await fs.readFile(path.join(root,'assets/verdant.png'));
 const transfer=await page.evaluateHandle(bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'dropped.png',{type:'image/png'}));return dt;},Array.from(png));
 await page.locator('#viewport').dispatchEvent('drop',{dataTransfer:transfer});await page.locator('#count').filter({hasText:/^0$/}).waitFor();
 await page.locator('#example').click();await page.locator('#count').filter({hasText:'23'}).waitFor();
 await page.locator('#mountList button').filter({hasText:'LE01'}).click();await page.screenshot({path:path.join(root,'test-results','editor.png')});
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'test-results','ui.json'),JSON.stringify({passed:true,checks:['23 existing mounts','properties','undo/redo','drag position','drag direction','drag arc','mirror/delete','symmetric placement','shield layer','zoom','exact hull export','save/open embedded sprite','PNG import','scale'],consoleErrors:errors},null,2));
 console.log('UI checks passed; exact Verdant export verified.');
 }catch(error){
  const state=await page.evaluate(()=>({focus:document.hasFocus(),activeElement:document.activeElement?.id,angle:document.getElementById('angle').value,arc:document.getElementById('arc').value,forward:document.getElementById('forward').value,status:document.getElementById('status').textContent})).catch(()=>null);
  await fs.writeFile(path.join(root,'test-results','ui-failure.json'),JSON.stringify({description:'When the recorded UI action runs, the expected contract should hold; an assertion failed.',expected:attemptedGesture?.expected,attemptedGesture,actual:state,error:String(error),executable:process.env.SHIPWRIGHT_EXECUTABLE||'source',observability:'Post-failure state only; cannot reconstruct missing earlier pointer events.'},null,2));
  await page.screenshot({path:path.join(root,'test-results','ui-failure.png')}).catch(()=>{});throw error;
 }finally{await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
