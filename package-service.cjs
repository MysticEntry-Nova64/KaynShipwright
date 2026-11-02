const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {validate,toShip}=require('./core-node.cjs');
const {png,safePath}=require('./native/assets.cjs');
const {serializeJson,boundedRead}=require('./native/file-io.cjs');
const toolVersion=require('./package.json').version;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const busy=new Set();
function packageMetadata(value, fallback='Shipwright design pack'){
 const name=value?.name??fallback,version=value?.version??'1.0.0';
 if(typeof name!=='string'||!name.trim()||name.length>100||/[\x00-\x1f]/.test(name)||typeof version!=='string'||!version.trim()||version.length>40||/[\x00-\x1f]/.test(version))throw Error('Enter a package name (1–100 characters) and version (1–40 characters).');
 return {name:name.trim(),version:version.trim()};
}
function folderFor(name){const folder=name.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'shipwright-design-pack';safePath(folder);return folder;}
function buildDesignPack(items,metadata){
 const frozen=JSON.parse(serializeJson(items));
 if(!Array.isArray(frozen)||!frozen.length||frozen.length>16)throw Error('Choose between 1 and 16 ships.');
 if(Buffer.byteLength(serializeJson(frozen))>150_000_000)throw Error('Package exceeds 150 MB input limit.');
 const meta=packageMetadata(metadata,frozen.length===1?frozen[0].project?.hull?.hullName:undefined),ids=new Set(),declared=new Map(),assets=new Map(),files=new Map(),paths=new Map(),ships=[];
 const add=(name,bytes,role)=>{
  safePath(name);const key=name.toLowerCase(),previous=paths.get(key);
  if(previous){if(!files.get(previous).bytes.equals(bytes))throw Error('Conflicting export path: '+name);return previous;}
  for(const existing of paths.keys())if(existing.startsWith(key+'/')||key.startsWith(existing+'/'))throw Error('File/directory path conflict: '+name);
  paths.set(key,name);files.set(name,{bytes,role});return name;
 };
 // Check original sprite claims first; deduplication must not hide a path conflict.
 const prepared=frozen.map(item=>{
  const p=item.project,checks=validate(p);if(checks.errors.length)throw Error((p?.hull?.hullName||'Ship')+': '+checks.errors.join(' '));
  const id=p.hull.hullId;safePath(id);if(!/^[-\w]+$/.test(id))throw Error('Unsafe hull ID: '+id);if(ids.has(id.toLowerCase()))throw Error('Duplicate hull ID: '+id);ids.add(id.toLowerCase());
  const sprite=safePath(p.hull.spriteName),image=png(p.image),key=sprite.toLowerCase(),hash=sha(image);
  if(declared.has(key)&&declared.get(key).hash!==hash)throw Error('Different sprites claim the same path: '+sprite);
  if(!declared.has(key))declared.set(key,{path:sprite,hash});
  return {p,checks,id,sprite,image,hash,preview:png(item.preview,12_000_000)};
 }).sort((a,b)=>a.id.localeCompare(b.id,'en'));
 for(const {p,checks,id,sprite,image,hash,preview}of prepared){
  // The first stable hull ID owns a shared asset path; only exported copies change.
  let canonical=assets.get(hash);if(!canonical){canonical=declared.get(sprite.toLowerCase()).path;add(canonical,image,'sprite');assets.set(hash,canonical);}
  const project=JSON.parse(serializeJson(p));project.hull.spriteName=canonical;const hull=toShip(project);
  const projectPath=`projects/${id}.shipwright.json`,hullPath=`data/hulls/${id}.ship`,previewPath=`previews/${id}.png`;
  add(projectPath,Buffer.from(JSON.stringify(project,null,2)),'editable-project');add(hullPath,Buffer.from(JSON.stringify(hull,null,2)),'ship-layout');add(previewPath,preview,'preview');
  const spritePixels={width:image.readUInt32BE(16),height:image.readUInt32BE(20)};
  if(spritePixels.width!==hull.width||spritePixels.height!==hull.height)checks.warnings.push('Sprite pixels differ from hull units; verify intentional scaling in game.');
  ships.push({hullId:id,name:hull.hullName,hullSize:hull.hullSize,project:projectPath,hull:hullPath,preview:previewPath,sprite:canonical,sourceSprite:sprite,spritePixels,hullUnits:{width:hull.width,height:hull.height},validation:checks,gameVerified:false});
 }
 add('README.txt',Buffer.from(`Shipwright V${toolVersion} design pack\n${meta.name} / ${meta.version}\n\n${ships.length} ship(s). Open files under projects/ to continue editing.\nThe one manifest.json inventories every ship, asset and hash. Preview images are under previews/.\nSprite files with identical bytes are stored once; exported project/hull paths refer to the shared file. Editable projects intentionally retain embedded PNGs so each remains independently usable.\n\nReadiness: DESIGN PACK. Not a complete playable Starsector mod. ship_data.csv stats, variants, mod_info.json, dependencies and campaign availability remain separate. No game or combat verification is claimed. File hashes identify this exact export for later testing.\n\nRe-exporting the same package name updates the same folder, without version-numbered copies. Only a recognized package folder containing its inventoried files can be replaced; unrelated files are not deleted.\nSprite artwork rights remain with its owners.\n`),'readme');
 const inventory=[...files].map(([name,{bytes,role}])=>({path:name,role,bytes:bytes.length,sha256:sha(bytes)}));
 const exportHash=sha(Buffer.from(inventory.map(f=>f.path+'\0'+f.sha256).join('\n')));
 const manifest={format:'kayn-shipwright-pack',formatVersion:2,package:meta,toolVersion,createdUTC:new Date().toISOString(),readiness:'design-pack',gameVerified:false,verification:{layoutValidated:true,gameTestedExportHash:null,status:'Not tested in Starsector; future game results must reference exportHash.'},exportHash,dependencies:{resolved:false,message:'Gameplay stats, variants, mod descriptor and dependencies remain to be integrated.'},validation:{errors:[],warnings:ships.flatMap(s=>s.validation.warnings.map(w=>s.hullId+': '+w))},ships,files:inventory};
 add('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)),'manifest');return {files,manifest,folder:folderFor(meta.name)};
}
async function checkReplaceable(folder){
 let stat;try{stat=await fs.lstat(folder);}catch(error){if(error.code==='ENOENT')return false;throw error;}
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Package destination is not a regular folder.');
 const manifest=JSON.parse((await boundedRead(path.join(folder,'manifest.json'),2_000_000)).toString('utf8'));
 if(manifest.format!=='kayn-shipwright-pack'||manifest.formatVersion!==2||!Array.isArray(manifest.files))throw Error('Destination is not a recognized Shipwright package.');
 const owned=new Set(['manifest.json',...manifest.files.map(f=>safePath(f.path).toLowerCase())]);
 async function inspect(dir,prefix=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isSymbolicLink())throw Error('Package contains a linked path: '+name);if(entry.isDirectory())await inspect(path.join(dir,entry.name),name+'/');else if(!entry.isFile()||!owned.has(name.toLowerCase()))throw Error('Package contains an unrelated file; move it before updating: '+name);}}
 await inspect(folder);return true;
}
async function publishPack(parent,built){
 const base=await fs.realpath(parent),destination=path.join(base,built.folder),key=destination.toLowerCase();if(busy.has(key))throw Error('This package is already exporting.');busy.add(key);let stage,retired,published=false;
 try{
  const replacing=await checkReplaceable(destination);stage=await fs.mkdtemp(path.join(base,'.shipwright-pack-stage-'));
  for(const [name,{bytes}]of built.files){const target=path.join(stage,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});if(sha(await fs.readFile(target))!==sha(bytes))throw Error('Package readback mismatch: '+name);}
  if(replacing){retired=await fs.mkdtemp(path.join(base,'.shipwright-pack-replace-'));await fs.rename(destination,path.join(retired,'previous'));}
  try{await fs.rename(stage,destination);published=true;stage=undefined;}catch(error){if(retired){await fs.rename(path.join(retired,'previous'),destination);}throw error;}
  return destination;
 }finally{
  busy.delete(key);if(stage)await fs.rm(stage,{recursive:true,force:true});if(retired){if(published)await fs.rm(retired,{recursive:true,force:true}).catch(error=>console.warn('Export completed; temporary cleanup failed:',retired,error.message));else{try{await fs.rmdir(retired);}catch{/* Retain previous output if rollback failed. */}}}
 }
}
async function exportFleetPackage(parent,items,metadata){return publishPack(parent,buildDesignPack(items,metadata));}
async function exportPackage(parent,project,preview,metadata){return exportFleetPackage(parent,[{project,preview}],metadata);}
module.exports={exportPackage,exportFleetPackage,buildDesignPack,packageMetadata,folderFor,safePath,png};
