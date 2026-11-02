import { fromShip, resize } from "./core";
import type { Project } from "./core";
export const DROP_FILES = 16, DROP_BYTES = 80_000_000, DROP_PIXELS = 32_000_000;
export async function preparePNGDrop(files: File[], existingIds: string[], alive: () => boolean): Promise<Project[]> {
 if (!files.length || files.length + existingIds.length > DROP_FILES) throw Error("Keep at most 16 dropped designs in one window.");
 if (files.some(f => !f.name.toLowerCase().endsWith(".png"))) throw Error("A PNG batch must contain only PNG files.");
 if (files.reduce((n,f)=>n+f.size,0)>DROP_BYTES) throw Error("PNG batch limit is 80 MB.");
 let pixels=0; const headers: {width:number;height:number}[]=[];
 for (const file of files) {
  if(file.size>40_000_000)throw Error("File limit is 40 MB.");
  const h=new Uint8Array(await file.slice(0,24).arrayBuffer());
  if(h.length<24 || ![137,80,78,71,13,10,26,10].every((v,i)=>h[i]===v) || String.fromCharCode(...h.slice(12,16))!=="IHDR")throw Error(`Invalid PNG: ${file.name}`);
  const view=new DataView(h.buffer,h.byteOffset,h.byteLength),width=view.getUint32(16),height=view.getUint32(20);
  if(!width||!height||width>16384||height>16384)throw Error("Maximum PNG dimension is 16384 pixels.");
  pixels+=width*height;if(pixels>DROP_PIXELS)throw Error("PNG batch pixel limit is 32 million.");headers.push({width,height});
 }
 const projects: Project[]=[];const ids=new Set(existingIds);
 for(let i=0;i<files.length;i++){
  if(!alive())return [];
  const f=files[i],{width,height}=headers[i];
  const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error(`Unable to read ${f.name}`));reader.readAsDataURL(f);});
  const decoded=new Image();decoded.src=image;await decoded.decode();if(decoded.width!==width||decoded.height!==height)throw Error("PNG dimensions changed during decode.");
  const base=f.name.replace(/\.png$/i,"").replace(/[^a-zA-Z0-9_-]/g,"_")||"new_ship";let id=base,n=2;while(ids.has(id))id=base+"_"+n++;ids.add(id);
  const kind=base.match(/(?:^|_)(frigate|destroyer|cruiser|capital)(?:_ship)?$/i)?.[1]?.toLowerCase();
  const cls=kind==='capital'?'CAPITAL_SHIP':kind?.toUpperCase()||'DESTROYER';
  const p=fromShip({hullId:id,hullName:base.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase()),hullSize:cls,style:"HIGH_TECH",width,height,center:[width/2,height/2],spriteName:`graphics/ships/${id}.png`,collisionRadius:Math.min(width,height)/2,shieldCenter:[0,0],shieldRadius:Math.max(width,height)/2,bounds:[],weaponSlots:[],engineSlots:[]},image);
  // A class suffix opts into a useful starting physical size; artwork stays unchanged.
  if(kind)resize(p,({frigate:160,destroyer:240,cruiser:320,capital:480} as Record<string,number>)[kind]/height);
  projects.push(p);
 }
 return projects;
}
