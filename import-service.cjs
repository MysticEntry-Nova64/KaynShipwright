const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {validate}=require('./core-node.cjs');
const {png,safePath}=require('./package-service.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const MAX_HULL=4_000_000,MAX_IMAGE=40_000_000;
async function exists(p){try{await fs.access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function boundedRead(file,max){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>max)throw Error(`File exceeds ${max} byte limit: ${path.basename(file)}`);const b=await fs.readFile(file);if(b.length>max)throw Error('File grew beyond size limit.');return b;}
// Game files allow comments and trailing commas. Never evaluate their contents.
function parseShip(text){
 let clean='',quoted=false,escape=false;
 for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];
  if(quoted){clean+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;clean+=c;continue;}
  if(c==='#'||(c==='/'&&n==='/')){while(i<text.length&&text[i]!=='\n')i++;clean+='\n';continue;}
  if(c==='/'&&n==='*'){const end=text.indexOf('*/',i+2);if(end<0)throw Error('Unterminated ship comment.');clean+=' ';i=end+1;continue;}clean+=c;
 }
 let normalized='';quoted=false;escape=false;
 for(let i=0;i<clean.length;i++){const c=clean[i];if(quoted){normalized+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;if(c===','){let j=i+1;while(/\s/.test(clean[j]||'')&&j<clean.length)j++;if(clean[j]===']'||clean[j]==='}')continue;}normalized+=c;}
 return JSON.parse(normalized.replace(/^\uFEFF/,''));
}
async function contentRoot(file){let dir=path.dirname(await fs.realpath(file));for(let i=0;i<16;i++){const relative=path.relative(dir,file).split(path.sep).join('/');if(relative.startsWith('data/hulls/'))return dir;const parent=path.dirname(dir);if(parent===dir)break;dir=parent;}return null;}
async function packagesFor(selected){const root=await fs.realpath(selected),packages=[];
 if(await exists(path.join(root,'starsector-core/data/hulls'))){packages.push(path.join(root,'starsector-core'));const mods=path.join(root,'mods');if(await exists(mods))for(const e of await fs.readdir(mods,{withFileTypes:true}))if(e.isDirectory()&&await exists(path.join(mods,e.name,'data/hulls')))packages.push(path.join(mods,e.name));}
 else if(await exists(path.join(root,'data/hulls')))packages.push(root);
 else throw Error('Choose a Starsector installation or a mod folder containing data/hulls.');
 return packages;
}
async function scan(selected){const roots=await packagesFor(selected),entries=[];let visited=0;
 async function walk(dir,root,depth=0){if(depth>12)throw Error('Ship folder nesting exceeds 12 levels.');for(const e of await fs.readdir(dir,{withFileTypes:true})){if(++visited>30000)throw Error('Folder scan exceeds 30000 items. Choose a smaller mod folder.');const file=path.join(dir,e.name);if(e.isDirectory())await walk(file,root,depth+1);else if(e.isFile()&&e.name.toLowerCase().endsWith('.ship')){if(entries.length>=5000)throw Error('More than 5000 ships. Choose a smaller mod folder.');let h,error;try{h=parseShip((await boundedRead(file,MAX_HULL)).toString('utf8'));if(!h||typeof h!=='object'||Array.isArray(h)||typeof h.hullName!=='string'||typeof h.hullId!=='string')throw Error('Expected a ship object with text hullName and hullId.');}catch(e){error=String(e.message);}entries.push({id:hash(file),file,roots,source:path.basename(root)==='starsector-core'?'Starsector':path.basename(root),name:typeof h?.hullName==='string'?h.hullName:e.name,hullId:typeof h?.hullId==='string'?h.hullId:'',hullSize:typeof h?.hullSize==='string'?h.hullSize:'',error});}}}
 for(const root of roots)await walk(path.join(root,'data/hulls'),root);
 return entries.sort((a,b)=>a.name.localeCompare(b.name)||a.source.localeCompare(b.source));
}
async function spriteAt(root,sprite){const target=path.resolve(root,...sprite.split('/'));if(!await exists(target))return null;const real=await fs.realpath(target),base=await fs.realpath(root),relative=path.relative(base,real);if(relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||relative==='..')throw Error('Sprite resolves outside the selected content folder.');return real;}
async function prepare(file,roots=[],manualSprite=null,verifyImage=()=>{}){
 const source=await fs.realpath(file),bytes=await boundedRead(source,MAX_HULL),hull=parseShip(bytes.toString('utf8'));
 if(!hull||typeof hull!=='object'||Array.isArray(hull))throw Error('Ship file must contain an object.');if(typeof hull.hullName!=='string'||!hull.hullName.trim())throw Error('Ship hullName must be nonempty text.');
 if(typeof hull.spriteName!=='string'||!/^graphics\/.+\.png$/i.test(hull.spriteName))throw Error('Expected a relative graphics/*.png spriteName in the ship file.');safePath(hull.spriteName);
 const own=await contentRoot(source);let sprite=manualSprite;
 if(!sprite&&own)sprite=await spriteAt(own,hull.spriteName);
 if(!sprite){const candidates=new Set();for(const root of roots){const found=await spriteAt(root,hull.spriteName);if(found)candidates.add(found);}if(candidates.size===1)sprite=[...candidates][0];else{const error=Error(candidates.size?'Several matching sprites found. Choose the matching PNG.':`Sprite not found: ${hull.spriteName}. Choose the matching PNG.`);error.code='SPRITE_REQUIRED';throw error;}}
 const spriteSource=await fs.realpath(sprite),imageBytes=await boundedRead(spriteSource,MAX_IMAGE),image='data:image/png;base64,'+imageBytes.toString('base64');png(image);verifyImage(imageBytes);
 const project={version:1,image,hull},errors=validate(project).errors;if(errors.length)throw Error('Unsupported or invalid layout: '+errors.join('\n'));
 return {project,source,spriteSource,sourceHash:hash(bytes),spriteHash:hash(imageBytes),fingerprint:hash(Buffer.concat([Buffer.from(source),bytes,imageBytes])),sourceName:own?(path.basename(own)==='starsector-core'?'Starsector':path.basename(own)):path.basename(path.dirname(source))};
}
function createLibrary(directory){let queue=Promise.resolve();
 async function list(){await fs.mkdir(directory,{recursive:true});const entries=[],warnings=[];for(const e of await fs.readdir(directory,{withFileTypes:true})){if(!e.isDirectory()||!/^ship-[a-f0-9-]{36}$/.test(e.name))continue;try{const item=JSON.parse((await boundedRead(path.join(directory,e.name,'entry.json'),60_000_000)).toString('utf8'));if(item.id!==e.name||item.format!==1||!item.project||validate(item.project).errors.length)throw Error('Invalid saved entry.');const {project,...metadata}=item;entries.push({...metadata,project:{hull:{hullName:project.hull.hullName,hullId:project.hull.hullId,hullSize:project.hull.hullSize}}});}catch(error){warnings.push(`${e.name}: ${error.message}`);}}return {entries,warnings};}
 function add(prepared){const job=queue.then(async()=>{const current=await list(),duplicate=current.entries.find(e=>e.fingerprint===prepared.fingerprint);if(duplicate)return {entry:duplicate,duplicate:true};const id='ship-'+crypto.randomUUID(),stage=await fs.mkdtemp(path.join(directory,'.pending-')),entry={format:1,id,createdUTC:new Date().toISOString(),...prepared};const text=JSON.stringify(entry);try{const file=path.join(stage,'entry.json');await fs.writeFile(file,text,{flag:'wx'});if((await fs.readFile(file,'utf8'))!==text)throw Error('Library readback mismatch.');await fs.rename(stage,path.join(directory,id));}catch(error){try{await fs.rm(stage,{recursive:true,force:true});}catch(cleanup){throw new AggregateError([error,cleanup],'Import failed; temporary library data could not be removed.');}throw error;}return {entry,duplicate:false};});queue=job.catch(()=>{});return job;}
 async function get(id){if(typeof id!=='string'||!/^ship-[a-f0-9-]{36}$/.test(id))throw Error('Invalid library entry.');const item=JSON.parse((await boundedRead(path.join(directory,id,'entry.json'),60_000_000)).toString('utf8'));if(item.id!==id||item.format!==1||validate(item.project).errors.length)throw Error('Library entry is missing or invalid.');return item;}
 return {list,add,get};
}
module.exports={parseShip,scan,prepare,createLibrary,packagesFor};
