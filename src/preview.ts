import {toScreen} from './core';
import type {Project,Point} from './core';
export async function previewPNG(p:Project):Promise<string>{
 const h=p.hull,img=new Image();img.src=p.image;await img.decode();
 const coordinates:Point[]=[[0,0],[h.width,h.height]],shield=toScreen(p,h.shieldCenter),origin=toScreen(p,[0,0]);
 coordinates.push([shield[0]-h.shieldRadius,shield[1]-h.shieldRadius],[shield[0]+h.shieldRadius,shield[1]+h.shieldRadius],[origin[0]-h.collisionRadius,origin[1]-h.collisionRadius],[origin[0]+h.collisionRadius,origin[1]+h.collisionRadius]);
 h.engineSlots.forEach(e=>{const a=toScreen(p,e.location),r=e.angle*Math.PI/180;coordinates.push([a[0]-e.width,a[1]-e.width],[a[0]+e.width,a[1]+e.width],[a[0]-Math.sin(r)*e.length,a[1]-Math.cos(r)*e.length]);});
 for(let i=0;i<h.bounds.length;i+=2)coordinates.push(toScreen(p,[h.bounds[i],h.bounds[i+1]]));
 h.weaponSlots.forEach(s=>coordinates.push(toScreen(p,s.locations)));
 const minX=Math.min(...coordinates.map(q=>q[0]))-30,minY=Math.min(...coordinates.map(q=>q[1]))-30;
 const width=Math.max(...coordinates.map(q=>q[0]))-minX+30,height=Math.max(...coordinates.map(q=>q[1]))-minY+30;
 if(!Number.isFinite(width)||!Number.isFinite(height))throw Error('Geometry exceeds preview range.');
 const scale=Math.min(2,1400/width,1200/height),canvas=document.createElement('canvas');canvas.width=1500;canvas.height=1400;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#101a20';ctx.fillRect(0,0,1500,1400);ctx.fillStyle='#e4eff1';ctx.font='24px Segoe UI';ctx.fillText(`${h.hullName} — Shipwright V1.0.2`,30,36);ctx.font='16px Segoe UI';ctx.fillText('BOW ↑  |  Orange: engines  Blue: shield  Green: bounds  Purple: collision radius',30,66);
 ctx.save();ctx.translate(30-minX*scale,100-minY*scale);ctx.scale(scale,scale);ctx.drawImage(img,0,0,h.width,h.height);ctx.lineWidth=1.5/scale;ctx.font=`${12/scale}px Segoe UI`;
 const circle=(q:Point,r:number,color:string)=>{ctx.strokeStyle=color;ctx.beginPath();ctx.arc(q[0],q[1],r,0,Math.PI*2);ctx.stroke();};
 circle(shield,h.shieldRadius,'#73cafa');circle(origin,h.collisionRadius,'#dc98e8');
 ctx.strokeStyle='#b0e699';ctx.beginPath();for(let i=0;i<h.bounds.length;i+=2){const q=toScreen(p,[h.bounds[i],h.bounds[i+1]]);i?ctx.lineTo(...q):ctx.moveTo(...q);ctx.fillStyle='#b0e699';ctx.fillText(`B${i/2+1}`,q[0]+3,q[1]-3);}if(h.bounds.length)ctx.closePath();ctx.stroke();
 h.engineSlots.forEach((e,i)=>{const q=toScreen(p,e.location),r=e.angle*Math.PI/180,d:Point=[-Math.sin(r),-Math.cos(r)],side:Point=[Math.cos(r),-Math.sin(r)],tip:Point=[q[0]+d[0]*e.length,q[1]+d[1]*e.length];ctx.strokeStyle='#ffad70';ctx.fillStyle='#ffad70';ctx.beginPath();ctx.moveTo(q[0]+side[0]*e.width/2,q[1]+side[1]*e.width/2);ctx.lineTo(q[0]-side[0]*e.width/2,q[1]-side[1]*e.width/2);ctx.moveTo(...q);ctx.lineTo(...tip);ctx.lineTo(tip[0]-d[0]*5+side[0]*3,tip[1]-d[1]*5+side[1]*3);ctx.moveTo(...tip);ctx.lineTo(tip[0]-d[0]*5-side[0]*3,tip[1]-d[1]*5-side[1]*3);ctx.stroke();ctx.fillText(`E${i+1}`,q[0]+5,q[1]-5);});
 h.weaponSlots.forEach(s=>{const q=toScreen(p,s.locations);circle(q,3,'#e9cf77');ctx.fillStyle='#e9cf77';ctx.fillText(s.id,q[0]+4,q[1]);});
 ctx.fillStyle='#73cafa';ctx.fillText(`Shield r ${h.shieldRadius}`,shield[0],shield[1]);ctx.restore();ctx.fillStyle='#b7cdd6';ctx.font='16px Segoe UI';ctx.fillText(`${h.hullId} | ${h.width} × ${h.height} units | ${h.engineSlots.length} engines | ${h.bounds.length/2} vertices`,30,1350);ctx.fillText('Design geometry preview. Verify behavior in the target game; stats and variants are separate.',30,1378);
 return canvas.toDataURL('image/png');
}
