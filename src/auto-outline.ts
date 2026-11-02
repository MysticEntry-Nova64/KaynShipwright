import { toGame } from './core.ts';
import type { Point, Project } from './core.ts';
import { outlineErrors } from './geometry.ts';

export type Mask = { width: number; height: number; alpha: Uint8Array };
export type OutlineMethod = 'rectangle' | 'convex' | 'contour';
export interface OutlineResult { points: Point[]; method: OutlineMethod; reason?: string; components: number }
const cross = (a: Point, b: Point, c: Point) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function convex(points: Point[]): Point[] {
 const sorted = [...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const half = (list: Point[]) => { const h: Point[]=[]; for(const p of list){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h; };
 const a=half(sorted), b=half([...sorted].reverse());a.pop();b.pop();return [...a,...b];
}
function rdp(points: Point[], tolerance: number): Point[] {
 if(points.length<3)return points;
 const a=points[0],b=points[points.length-1],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
 let best=0,index=0;
 for(let i=1;i<points.length-1;i++){const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0,d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d>best){best=d;index=i;}}
 return best>tolerance?[...rdp(points.slice(0,index+1),tolerance).slice(0,-1),...rdp(points.slice(index),tolerance)]:[a,b];
}
function simplify(points: Point[], tolerance: number): Point[] {
 let far=1;for(let i=2;i<points.length;i++)if(Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1])>Math.hypot(points[far][0]-points[0][0],points[far][1]-points[0][1]))far=i;
 return [...rdp(points.slice(0,far+1),tolerance).slice(0,-1),...rdp([...points.slice(far),points[0]],tolerance).slice(0,-1)];
}
// Bounded 512px mask supplied by the decoder. Alpha, not paint brightness, defines the hull.
export function generateOutline(mask: Mask, requested: OutlineMethod='contour'): OutlineResult {
 const {width:w,height:h,alpha}=mask;if(w<1||h<1||w*h>512*512||alpha.length!==w*h)throw Error('Invalid outline mask.');
 const occupied=new Uint8Array(w*h),labels=new Int32Array(w*h),sizes:number[]=[0];
 let total=0;for(let i=0;i<alpha.length;i++){occupied[i]=alpha[i]>=128?1:0;total+=occupied[i];}
 if(!total)throw Error('No opaque hull pixels found; outline left empty.');
 const queue=new Int32Array(w*h);
 for(let i=0;i<occupied.length;i++)if(occupied[i]&&!labels[i]){const id=sizes.length;let head=0,tail=1;queue[0]=i;labels[i]=id;while(head<tail){const n=queue[head++],x=n%w,y=Math.floor(n/w);for(const q of [x?n-1:-1,x+1<w?n+1:-1,y?n-w:-1,y+1<h?n+w:-1])if(q>=0&&occupied[q]&&!labels[q]){labels[q]=id;queue[tail++]=q;}}sizes.push(tail);}
 let largest=1;for(let i=2;i<sizes.length;i++)if(sizes[i]>sizes[largest])largest=i;
 const all:Point[]=[],edges=new Map<number,number[]>(),stride=w+1;
 const edge=(x:number,y:number,X:number,Y:number)=>{const key=y*stride+x;const list=edges.get(key)||[];list.push(Y*stride+X);edges.set(key,list);};
 let minX=w,minY=h,maxX=0,maxY=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(occupied[y*w+x]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);if(!x||!y||x===w-1||y===h-1||!occupied[y*w+x-1]||!occupied[y*w+x+1]||!occupied[(y-1)*w+x]||!occupied[(y+1)*w+x])all.push([x,y],[x+1,y],[x+1,y+1],[x,y+1]);if(labels[y*w+x]===largest){const has=(X:number,Y:number)=>X>=0&&X<w&&Y>=0&&Y<h&&labels[Y*w+X]===largest;if(!has(x,y-1))edge(x,y,x+1,y);if(!has(x+1,y))edge(x+1,y,x+1,y+1);if(!has(x,y+1))edge(x+1,y+1,x,y+1);if(!has(x-1,y))edge(x,y+1,x,y);}}
 const components=sizes.length-1, fallback=(reason:string):OutlineResult=>({points:convex(all),method:'convex',reason,components});
 if(requested==='rectangle')return {points:[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]],method:requested,components};
 if(requested==='convex')return fallback('Requested convex comparison.');
 if((total-sizes[largest])/total>0.01)return fallback('Disconnected hull pieces exceed 1%; convex outline includes them.');
 if([...edges.values()].some(v=>v.length!==1))return fallback('Ambiguous touching boundary.');
 const loops:Point[][]=[];
 while(edges.size){const start=edges.keys().next().value!;let at=start;const loop:Point[]=[];do{loop.push([at%stride,Math.floor(at/stride)]);const next=edges.get(at);if(!next)return fallback('Open contour.');edges.delete(at);at=next[0];}while(at!==start);loops.push(loop);}
 const area=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0));
 loops.sort((a,b)=>area(b)-area(a));let tolerance=1.2,points=simplify(loops[0],tolerance);
 while(points.length>48&&tolerance<32){tolerance*=1.4;points=simplify(loops[0],tolerance);}
 if(points.length>48||outlineErrors(points.flat()).length)return fallback('Simplified contour failed polygon validation.');
 return {points,method:'contour',components, ...(components>1?{reason:'Tiny detached pixels ignored (at most 1% opaque area).'}:{})};
}
export async function outlineForProject(p: Project): Promise<{bounds:number[];result:OutlineResult}> {
 const image=new Image();image.src=p.image;await image.decode();
 const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight)),w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(image,0,0,w,h);
 const rgba=context.getImageData(0,0,w,h).data,alpha=new Uint8Array(w*h);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
 const result=generateOutline({width:w,height:h,alpha}),bounds=result.points.flatMap(([x,y])=>toGame(p,[x*p.hull.width/w,y*p.hull.height/h]));
 const errors=outlineErrors(bounds);if(errors.length)throw Error(errors.join(' '));return {bounds,result};
}
