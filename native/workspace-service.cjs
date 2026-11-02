const fs=require('node:fs/promises'),path=require('node:path');
const {validate,toShip}=require('../core-node.cjs');
const {serializeJson,boundedRead}=require('./file-io.cjs');
const {saveFile}=require('../save-service.cjs');
const LIMIT=150_000_000;
function checkWorkspace(value){
 if(value?.format!==1||!Array.isArray(value.documents)||!value.documents.length||value.documents.length>16||!Number.isInteger(value.active)||value.active<0||value.active>=value.documents.length)throw Error('Invalid workspace.');
 const ids=new Set();for(const d of value.documents){if(typeof d.id!=='string'||ids.has(d.id)||typeof d.dirty!=='boolean'||!Number.isFinite(d.zoom)||d.zoom<.1||d.zoom>10||typeof d.selected!=='string'||!['weapons','engines','shield','bounds'].includes(d.tool)||validate(d.project).errors.length)throw Error('Invalid workspace document.');ids.add(d.id);}
 const text=serializeJson(value);if(Buffer.byteLength(text)>LIMIT)throw Error('Workspace recovery limit is 150 MB. Save projects before closing.');return text;
}
function createWorkspaceStore(directory){
 const file=path.join(directory,'workspace-v1.json'),backup=file+'.previous';let queue=Promise.resolve();
 async function read(){await queue;let warning;for(const candidate of [file,backup]){try{const value=JSON.parse((await boundedRead(candidate,LIMIT)).toString('utf8'));checkWorkspace(value);return {workspace:value,warning:candidate===backup?'Recovered previous workspace; latest copy was unavailable.':warning};}catch(error){if(error.code!=='ENOENT')warning='Workspace recovery unavailable: '+error.message;}}return {workspace:null,warning};}
 function write(value){const text=checkWorkspace(value);const pending=queue.then(async()=>{await fs.mkdir(directory,{recursive:true});try{const previous=await boundedRead(file,LIMIT);checkWorkspace(JSON.parse(previous.toString('utf8')));await saveFile(backup,previous.toString('utf8'));}catch(error){if(error.code!=='ENOENT')console.warn('Previous workspace not rotated:',error.message);}await saveFile(file,text);return true;});queue=pending.catch(()=>{});return pending;}
 return {read,write};
}
function preflight(items,mode){
 if(!['save','ship','package'].includes(mode)||!Array.isArray(items)||!items.length||items.length>16)throw Error('Invalid batch.');
 const ids=new Set();let bytes=0;
 for(const item of items){const errors=validate(item.project).errors;if(errors.length)throw Error(item.project?.hull?.hullName+': '+errors.join(' '));const id=item.project.hull.hullId;if(!/^[-\w]+$/.test(id)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id))throw Error('Unsafe batch hull ID: '+id);if(ids.has(id.toLowerCase()))throw Error('Duplicate hull ID: '+id);ids.add(id.toLowerCase());bytes+=Buffer.byteLength(serializeJson(item));}if(bytes>LIMIT)throw Error('Batch exceeds 150 MB.');
}
async function runBatch(parent,items,mode,metadata){
 const frozen=JSON.parse(serializeJson(items));preflight(frozen,mode);const results=[];
 if(mode==='package'){const output=await require('../package-service.cjs').exportFleetPackage(parent,frozen,metadata);return frozen.map(item=>({id:item.id,hullId:item.project.hull.hullId,ok:true,output}));}
 for(const item of frozen){const id=item.project.hull.hullId;try{let output;if(mode==='package')output=await require('../package-service.cjs').exportPackage(parent,item.project,item.preview);else{output=path.join(parent,id+(mode==='save'?'.shipwright.json':'.ship'));await saveFile(output,JSON.stringify(mode==='save'?item.project:toShip(item.project),null,2));}results.push({id:item.id,hullId:id,ok:true,output});}catch(error){results.push({id:item.id,hullId:id,ok:false,error:error.message});}}
 return results;
}
module.exports={createWorkspaceStore,checkWorkspace,preflight,runBatch};
