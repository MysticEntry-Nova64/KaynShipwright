import type {Project} from './core';
// Comparison geometry is display-only and uses one common scale for both hulls.
const NS='http://www.w3.org/2000/svg';
interface Reference {hullSize:string;name:string;width:number;height:number;image:string}
let references:Reference[]=[];
function element(tag:string,attributes:Record<string,unknown>,parent:Element){const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));parent.append(node);return node;}
export async function loadReference(){const response=await fetch('assets/class-references.json');if(!response.ok)throw Error('Reference data unavailable');references=await response.json();}
export function drawReferences(project:Project){const svg=document.getElementById('scaleReferences') as unknown as SVGSVGElement;svg.replaceChildren();const selected=(document.getElementById('referenceClass') as HTMLSelectElement).value;const reference=references.find(r=>r.hullSize===(selected==='AUTO'?project.hull.hullSize:selected));if(!reference)return;
 const h=project.hull,unit=Math.min(240/Math.max(h.height,reference.height),180/Math.max(h.width,reference.width));
 const defs=element('defs',{},svg),filter=element('filter',{id:'reference-shadow',x:'0%',y:'0%',width:'100%',height:'100%','color-interpolation-filters':'sRGB'},defs);
 element('feColorMatrix',{type:'matrix',values:'0 0 0 0 0.40  0 0 0 0 0.49  0 0 0 0 0.53  0 0 0 0.8 0'},filter);
 const text=(x:number,y:number,value:string,small=false)=>{const t=element('text',{x,y,'text-anchor':'middle',class:small?'referenceText muted':'referenceText'},svg);t.textContent=value;};
 const entries=[{name:h.hullName,width:h.width,height:h.height,image:project.image,ratio:0},{name:`${reference.name} · 1:1`,width:reference.width,height:reference.height,image:reference.image,ratio:1}];
 entries.forEach((entry,i)=>{const cx=165+i*330,w=entry.width*unit,ht=entry.height*unit;const attrs:Record<string,unknown>={href:entry.image,x:cx-w/2,y:260-ht,width:w,height:ht,preserveAspectRatio:'none'};if(i===0)attrs['data-current-ship']='true';else{attrs['data-reference']=entry.ratio;attrs.filter='url(#reference-shadow)';}element('image',attrs,svg);text(cx,286,entry.name);text(cx,305,`${Number(entry.width.toFixed(2))} × ${Number(entry.height.toFixed(2))} units`,true);});
 element('line',{x1:10,y1:262,x2:650,y2:262,stroke:'#40525b','stroke-width':1},svg);
 document.getElementById('comparisonRatio')!.textContent=`Current hull length: ${(h.height/reference.height).toFixed(2)}× original ${reference.name} · width: ${(h.width/reference.width).toFixed(2)}×. Based on current project dimensions, independent of canvas zoom.`;
}
