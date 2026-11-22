const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const root=path.resolve(__dirname,'..'),pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const release=path.resolve(process.env.SHIPWRIGHT_RELEASE_OUTPUT||path.join(root,'release-v'+pkg.version));
 await fs.mkdir(release,{recursive:false});
 const stage=path.join(release,'runtime-source');await fs.mkdir(stage);
 const files=['app.js','core-node.cjs','index.html','main.cjs','preload.cjs','import-service.cjs','package-service.cjs','save-service.cjs','style.css','studio.css',
  'native/assets.cjs','native/file-io.cjs','native/import-ipc.cjs','native/location-service.cjs','native/ship-format.cjs','native/ship-library.cjs','native/ship-source.cjs','native/workspace-service.cjs',
  'assets/class-references.json','assets/eagle-reference.png','assets/hammerhead-reference.json','assets/hammerhead-reference.png','assets/lasher-reference.png','assets/onslaught-reference.png','assets/talon-reference.png','assets/verdant.png','assets/verdant.ship','assets/ui/select-folder-guide.png','assets/ui/CREDITS.txt','docs/mascot-provenance.md',
  'assets/ui/state-artwork-2026-11-22/manifest.json','assets/ui/state-artwork-2026-11-22/wink-144.png','assets/ui/state-artwork-2026-11-22/salute-goodbye-smile-v4-160.png','assets/ui/state-artwork-2026-11-22/salute-goodbye-smile-v4-110.png'];
 const source=[];for(const name of files){const bytes=await fs.readFile(path.join(root,name)),dest=path.join(stage,name);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);source.push({file:name,sha256:hash(bytes),bytes:bytes.length});}
 const runtimePackage={name:pkg.name,productName:pkg.productName,version:pkg.version,description:pkg.description,main:pkg.main,type:pkg.type};
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(runtimePackage,null,2)+'\n');
 await fs.writeFile(path.join(release,'runtime-source-manifest.json'),JSON.stringify({version:pkg.version,source,package:runtimePackage},null,2));
 const {packager}=await import('@electron/packager');
 const destinations=await packager({dir:stage,name:pkg.productName,platform:'win32',arch:'x64',electronVersion:pkg.devDependencies.electron,appVersion:pkg.version,buildVersion:pkg.version,win32metadata:{CompanyName:"Kayn's Workshop"},out:path.join(release,'portable'),asar:true,overwrite:false,prune:true,tmpdir:path.join(release,'packager-temp')});
 assert.equal(destinations.length,1);
 const asar=await import('@electron/asar'),archive=path.join(destinations[0],'resources/app.asar'),entries=[];
 for(const entry of asar.listPackage(archive)){const raw=entry.replace(/^[/\\]+/,''),name=raw.replaceAll('\\','/'),stat=asar.statFile(archive,raw);if(stat.files)continue;assert(!stat.link&&!stat.unpacked);const bytes=asar.extractFile(archive,raw);entries.push({file:name,sha256:hash(bytes),bytes:bytes.length});if(name!=='package.json'){const expected=source.find(x=>x.file===name);assert(expected,'Undeclared packaged file: '+name);assert.equal(hash(bytes),expected.sha256);}}
 assert.equal(entries.length,source.length+1);
 const actualPackage=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(actualPackage.version,pkg.version);assert.equal(actualPackage.main,pkg.main);assert.equal(actualPackage.name,pkg.name);
 const result={passed:true,version:pkg.version,root,release,stage,packageDirectory:destinations[0],executable:path.join(destinations[0],pkg.productName+'.exe'),archive,archiveSha256:hash(await fs.readFile(archive)),entries};
 await fs.writeFile(path.join(release,'package-receipt.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1});

