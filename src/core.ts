import {outlineErrors} from './geometry.ts';
export type Point=[number,number];
export interface Slot {id:string;locations:Point;type:string;size:string;mount:string;angle:number;arc:number;[key:string]:unknown}
export interface Hull {hullId:string;hullName:string;hullSize:string;width:number;height:number;center:Point;spriteName:string;weaponSlots:Slot[];engineSlots:any[];bounds:number[];shieldCenter:Point;shieldRadius:number;collisionRadius:number;[key:string]:any}
export interface Project {version:1;image:string;hull:Hull}
export const categories=['ENERGY','BALLISTIC','MISSILE','SYNERGY','HYBRID','COMPOSITE','UNIVERSAL','DECORATIVE','BUILT_IN'];
export const sizes=['SMALL','MEDIUM','LARGE'];
export const clone=<T>(x:T):T=>JSON.parse(JSON.stringify(x));
export function fromShip(hull:Hull,image:string):Project{return {version:1,image,hull:clone(hull)};}
export function toScreen(p:Project,[f,l]:Point):Point{return [p.hull.center[0]-l,p.hull.height-p.hull.center[1]-f];}
export function toGame(p:Project,[x,y]:Point):Point{return [p.hull.height-p.hull.center[1]-y,p.hull.center[0]-x];}
export function nextId(p:Project){let n=1;while(p.hull.weaponSlots.some(s=>s.id===`W${String(n).padStart(3,'0')}`))n++;return `W${String(n).padStart(3,'0')}`;}
export function mirror(p:Project,s:Slot):Slot{return {...clone(s),id:nextId(p),locations:[s.locations[0],-s.locations[1]],angle:-s.angle};}
const point=(x:unknown):x is Point=>Array.isArray(x)&&x.length===2&&x.every(Number.isFinite);
export function validate(p:any){const errors:string[]=[],warnings:string[]=[];const h=p?.hull;
 if(p?.version!==1||!h||typeof h!=='object'||Array.isArray(h))return {errors:['Unsupported or missing project version/hull.'],warnings};
 if(typeof p.image!=='string'||!p.image.startsWith('data:image/png;base64,'))errors.push('A PNG sprite is required.');
 if(typeof h.hullId!=='string'||!/^[a-zA-Z0-9_-]+$/.test(h.hullId))errors.push('Hull ID must use letters, numbers, underscores or dashes.');
 if(!['FRIGATE','DESTROYER','CRUISER','CAPITAL_SHIP','FIGHTER'].includes(h.hullSize))errors.push('Invalid hull class.');
 if(![h.width,h.height].every((n:number)=>Number.isFinite(n)&&n>0&&n<=16384)||!point(h.center))errors.push('Invalid hull dimensions or centre.');
 if(typeof h.spriteName!=='string'||!/^graphics\/ships\/[a-zA-Z0-9_/-]+\.png$/.test(h.spriteName)||h.spriteName.includes('..'))errors.push('Sprite path must be a safe graphics/ships/*.png path.');
 if(!Array.isArray(h.weaponSlots)||h.weaponSlots.length>8192)return {errors:[...errors,'Missing weapon slots.'],warnings};
 const ids=new Set<string>();for(const s of h.weaponSlots){if(!s||typeof s!=='object'){errors.push('Invalid mount.');continue;}if(typeof s.id!=='string'||!s.id||ids.has(s.id))errors.push('Mount IDs must be nonempty and unique.');ids.add(s.id);
 if(!point(s.locations)||!Number.isFinite(s.angle)||!Number.isFinite(s.arc)||s.arc<0||s.arc>360)errors.push(`${s.id}: invalid coordinates, angle or arc.`);
 if(!categories.includes(s.type)||!sizes.includes(s.size)||!['TURRET','HARDPOINT','HIDDEN'].includes(s.mount))errors.push(`${s.id}: invalid mount type or size.`);
 if(point(s.locations)&&point(h.center)){const [x,y]=toScreen(p,s.locations);if(!Number.isFinite(x)||!Number.isFinite(y))errors.push(`${s.id}: screen coordinates overflow.`);else if(x<0||y<0||x>h.width||y>h.height)warnings.push(`${s.id} is outside the sprite rectangle.`);}}
 if(!point(h.shieldCenter)||!Number.isFinite(h.shieldRadius)||h.shieldRadius<0||!Number.isFinite(h.collisionRadius)||h.collisionRadius<0)errors.push('Invalid shield or collision geometry.');
 if(!Array.isArray(h.bounds)||h.bounds.length>8192||h.bounds.length%2!==0||!h.bounds.every(Number.isFinite))errors.push('bounds: expected finite coordinate pairs.');else errors.push(...outlineErrors(h.bounds));
 if(!Array.isArray(h.engineSlots)||h.engineSlots.length>4096)errors.push('engineSlots: expected an array of at most 4096 engines.');
 else h.engineSlots.forEach((e:any,i:number)=>{if(!e||typeof e!=='object'||!point(e.location)||![e.angle,e.width,e.length].every(Number.isFinite)||e.width<=0||e.length<=0||(e.contrailSize!==undefined&&(!Number.isFinite(e.contrailSize)||e.contrailSize<0)))errors.push(`engineSlots[${i}]: finite location/angle, positive width/length and nonnegative contrail size required.`);});
 return {errors,warnings};}
export function toShip(p:Project):Hull {const v=validate(p);if(v.errors.length)throw Error(v.errors.join('\n'));return clone(p.hull);}
export function parseProject(text:string):Project {const p=JSON.parse(text);const v=validate(p);if(v.errors.length)throw Error(v.errors.join('\n'));return p;}
function scaleCandidate(p:Project,f:number){if(!Number.isFinite(f)||f<=0)throw Error('Scale must be positive.');const h=p.hull;h.width*=f;h.height*=f;h.center=h.center.map(n=>n*f) as Point;h.shieldCenter=h.shieldCenter.map(n=>n*f) as Point;h.shieldRadius*=f;h.collisionRadius*=f;h.bounds=h.bounds.map(n=>n*f);for(const s of h.weaponSlots)s.locations=s.locations.map(n=>n*f) as Point;for(const e of h.engineSlots){e.location=e.location.map((n:number)=>n*f);for(const k of ['width','length','contrailSize'])if(typeof e[k]==='number')e[k]*=f;}}
export function resize(p:Project,f:number){const sourceErrors=validate(p).errors;if(sourceErrors.length)throw Error(sourceErrors.join('\n'));const candidate=clone(p);scaleCandidate(candidate,f);const errors=validate(candidate).errors;if(errors.length)throw Error(errors.join('\n'));Object.assign(p,candidate);}
export class History {items:Project[];index=0;constructor(p:Project){this.items=[clone(p)];}push(p:Project){this.items=this.items.slice(0,this.index+1);this.items.push(clone(p));if(this.items.length>80)this.items.shift();this.index=this.items.length-1;}undo(){return this.index>0?clone(this.items[--this.index]):null;}redo(){return this.index<this.items.length-1?clone(this.items[++this.index]):null;}}
