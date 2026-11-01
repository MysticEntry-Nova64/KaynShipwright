import {clone,validate} from './core.ts';
import type {Project,Point} from './core.ts';

export type Selection={kind:'engine'|'vertex';index:number}|{kind:'shield'|'radius'|'collision'};
export function edit(p:Project,change:(candidate:Project)=>void):Project {
 const candidate=clone(p);change(candidate);
 const errors=validate(candidate).errors;if(errors.length)throw Error(errors.join('\n'));
 return candidate;
}
export function outlineErrors(bounds:number[]):string[]{
 if(!bounds.length)return [];
 if(bounds.length<6)return ['bounds: use at least three vertices, or an empty outline.'];
 const pts:Point[]=[];for(let i=0;i<bounds.length;i+=2)pts.push([bounds[i],bounds[i+1]]);
 const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const on=(a:Point,b:Point,c:Point)=>Math.abs(cross(a,b,c))<1e-8&&c[0]>=Math.min(a[0],b[0])-1e-8&&c[0]<=Math.max(a[0],b[0])+1e-8&&c[1]>=Math.min(a[1],b[1])-1e-8&&c[1]<=Math.max(a[1],b[1])+1e-8;
 for(let i=0;i<pts.length;i++){
  const a=pts[i],b=pts[(i+1)%pts.length];
  if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6)return ['bounds: zero-length edge.'];
  const previous=pts[(i+pts.length-1)%pts.length];
  if(on(previous,a,b)||on(a,b,previous))return ['bounds: overlapping adjacent edges.'];
  for(let j=i+1;j<pts.length;j++){
   if(j===i+1||(i===0&&j===pts.length-1))continue;
   const c=pts[j],d=pts[(j+1)%pts.length];
   if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return ['bounds: edges intersect or touch.'];
  }
 }
 const area=pts.reduce((sum,a,i)=>{const b=pts[(i+1)%pts.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
 return Math.abs(area)<1e-6?['bounds: outline has no area.']:[];
}
export function addEngine(p:Project,location:Point){p.hull.engineSlots.push({location,angle:180,width:10,length:40,contrailSize:20,style:'HIGH_TECH'});}
export function copyEngine(p:Project,index:number,mirror=false){
 const engine=clone(p.hull.engineSlots[index]);
 engine.location=mirror?[engine.location[0],-engine.location[1]]:[engine.location[0]+5,engine.location[1]+5];
 if(mirror)engine.angle=-engine.angle;p.hull.engineSlots.push(engine);
}
export function rectangleBounds(p:Project){const h=p.hull;const front=h.height-h.center[1],back=-h.center[1];h.bounds=[back,h.center[0],front,h.center[0],front,h.center[0]-h.width,back,h.center[0]-h.width];}
export function insertVertex(p:Project,point:Point){
 const b=p.hull.bounds;if(b.length<6)throw Error('Create a rectangle outline first.');
 let best=Infinity,index=0,nearest=point;
 for(let i=0;i<b.length;i+=2){const j=(i+2)%b.length,a:Point=[b[i],b[i+1]],d:Point=[b[j]-a[0],b[j+1]-a[1]],len=d[0]*d[0]+d[1]*d[1];const t=Math.max(0,Math.min(1,((point[0]-a[0])*d[0]+(point[1]-a[1])*d[1])/len));const q:Point=[a[0]+t*d[0],a[1]+t*d[1]],distance=Math.hypot(q[0]-point[0],q[1]-point[1]);if(distance<best){best=distance;index=i+2;nearest=q;}}
 b.splice(index,0,...nearest);return index/2;
}
