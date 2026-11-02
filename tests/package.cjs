const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {exportPackage,safePath}=require('../package-service.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),parent=path.join(root,'test-results','package-failures');await fs.mkdir(parent,{recursive:true});
 const project=JSON.parse(await fs.readFile(path.join(root,'test-results','geometry.shipwright.json'),'utf8'));
 for(const name of ['../bad','graphics/../bad.png','graphics/con.png','C:/bad.png','graphics/a\\b.png','/absolute','a//b','a./b'])assert.throws(()=>safePath(name),name);
 const data=project.image;
 const before=await fs.readdir(parent);
 await assert.rejects(()=>exportPackage(parent,{...project,hull:{...project.hull,spriteName:'graphics/ships/../escape.png'}},data));
 await assert.rejects(()=>exportPackage(parent,project,'data:image/png;base64,AA=='));
 const original=fs.writeFile;let count=0;
 fs.writeFile=async(...args)=>{if(++count===3)throw Error('Injected disk failure');return original(...args);};
 try{await assert.rejects(()=>exportPackage(parent,project,data),/Injected disk failure/);}finally{fs.writeFile=original;}
 assert.deepEqual(await fs.readdir(parent),before);
 await fs.writeFile(path.join(root,'test-results','package-failures.json'),JSON.stringify({passed:true,checks:['path traversal and reserved device names','invalid model rejected','invalid preview PNG rejected','injected disk write failure removes only owned staging directory','no incomplete final package']},null,2));console.log('Package failure containment passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
