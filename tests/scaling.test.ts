import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fromShip,resize,validate,toShip} from '../src/core.ts';
const hull=JSON.parse(fs.readFileSync(new URL('../assets/verdant.ship',import.meta.url),'utf8'));
const make=()=>fromShip(hull,'data:image/png;base64,AA==');
test('rejected scales preserve project data and hull identity',()=>{
 for(const factor of [NaN,Infinity,-Infinity,0,-1,1e308,Number.MIN_VALUE]){
  const p=make(),before=structuredClone(p),identity=p.hull;
  assert.throws(()=>resize(p,factor));assert.deepEqual(p,before);assert.equal(p.hull,identity);
 }
});
test('scaling cannot launder invalid nonfinite source through JSON clone',()=>{
 const p=make();p.hull.shieldRadius=Infinity;const before=structuredClone(p);
 assert.throws(()=>resize(p,1));assert.deepEqual(p,before);
});
test('finite coordinates producing infinite screen positions reject scaling atomically',()=>{
 const p=make();p.hull.center[0]=1e308;p.hull.weaponSlots[0].locations[1]=-1e308;
 const before=structuredClone(p);assert.throws(()=>resize(p,1));assert.deepEqual(p,before);
});
test('scaling rejects overflowing polygon arithmetic although coordinates remain finite',()=>{
 const p=make();p.hull.bounds=[0,0,1e153,0,1e153,1e153,0,1e153];
 assert.equal(validate(p).errors.length,0);const before=structuredClone(p);
 assert.throws(()=>resize(p,10));assert.deepEqual(p,before);
});
test('overflow in each scaled geometry category rejects without partial mutation',()=>{
 const mutations=[p=>p.hull.center[0]=1e308,p=>p.hull.shieldCenter[0]=1e308,p=>p.hull.shieldRadius=1e308,p=>p.hull.collisionRadius=1e308,p=>p.hull.weaponSlots[0].locations[0]=1e308,p=>p.hull.engineSlots[0].location[0]=1e308,p=>p.hull.engineSlots[0].width=1e308,p=>p.hull.engineSlots[0].length=1e308,p=>p.hull.engineSlots[0].contrailSize=1e308] as ((p:ReturnType<typeof make>)=>void)[];
 for(const mutate of mutations){const p=make();mutate(p);const before=structuredClone(p);assert.throws(()=>resize(p,2));assert.deepEqual(p,before);}
});
test('normal scaling and inverse preserve exportable geometry within domain tolerance',()=>{
 const p=make(),before=structuredClone(p);resize(p,1.25);assert.equal(p.hull.width,before.hull.width*1.25);resize(p,.8);
 const compare=(a:any,b:any)=>{if(typeof a==='number'){assert.ok(Math.abs(a-b)<=1e-9);return;}if(a&&typeof a==='object'){for(const k of Object.keys(a))compare(a[k],b[k]);}else assert.equal(a,b);};
 compare(toShip(p),before.hull);assert.equal(validate(p).errors.length,0);
});
