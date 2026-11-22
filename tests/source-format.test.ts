import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fromShip,toShip,validate,moveSlot,mirror,resize,slotPoints,parseProject} from '../src/core.ts';
import type {Locations} from '../src/core.ts';
const hull=JSON.parse(fs.readFileSync(new URL('../assets/verdant.ship',import.meta.url),'utf8'));
const image='data:image/png;base64,AA==';

test('seeded round trips preserve unknown fields, grouped mounts and optional-array presence',()=>{
 const presenceMasks=new Set<number>(),groupSizes=new Set<number>();
 for(const initialSeed of [7,88123,20261103,0xffffffff]){
  let seed=initialSeed;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  for(let sample=0;sample<256;sample++){
   const source=structuredClone(hull);
   source.hullName=`Round trip ${initialSeed}:${sample} é 🚀`;
   source.unknown={nested:[null,false,0,-0,random()*1e9,'水'],object:{preserve:sample}};
   const groups=1+Math.floor(random()*8);
   source.weaponSlots[0].locations=Array.from({length:2*groups},()=>Math.round((random()-.5)*2000));
   source.weaponSlots[0].unknown={keep:['extra',sample]};
   for(const [bit,key] of ['weaponSlots','engineSlots','bounds'].entries())if(sample&(1<<bit))delete source[key];
   presenceMasks.add(sample&7);if(source.weaponSlots)groupSizes.add(groups);
   const untouched=structuredClone(source),project=fromShip(source,image);
   assert.deepEqual(validate(project).errors,[],`seed ${initialSeed}, sample ${sample}`);
   // Expected wire data comes from source, not exporter output; JSON normalizes -0.
   assert.deepEqual(toShip(parseProject(JSON.stringify(project))),JSON.parse(JSON.stringify(source)));
   assert.deepEqual(source,untouched,'import/export must not mutate source data');
  }
 }
 assert.deepEqual([...presenceMasks].sort((a,b)=>a-b),[0,1,2,3,4,5,6,7]);
 assert.deepEqual([...groupSizes].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
});
test('optional absent arrays gain editor defaults without changing exported source fields',()=>{
 const source=structuredClone(hull);for(const key of ['weaponSlots','engineSlots','bounds'])delete source[key];
 const p=fromShip(source,image);assert.deepEqual(validate(p).errors,[]);assert.deepEqual(p.hull.weaponSlots,[]);assert.deepEqual(toShip(p),source);
 assert.deepEqual(toShip(parseProject(JSON.stringify(p))),source);
 p.hull.weaponSlots.push(structuredClone(hull.weaponSlots[0]));assert.equal(toShip(p).weaponSlots.length,1);
 assert.equal(Object.hasOwn(toShip(p),'engineSlots'),false);assert.equal(Object.hasOwn(source,'weaponSlots'),false);
});
test('explicit empty arrays and malformed null arrays retain distinct meaning',()=>{
 const p=fromShip({...structuredClone(hull),weaponSlots:[]},image);assert.ok(Object.hasOwn(toShip(p),'weaponSlots'));
 const invalid=fromShip({...structuredClone(hull),weaponSlots:null},image);assert.ok(validate(invalid).errors.length);
 assert.ok(validate({...p,omittedArrays:['hullId']}).errors.length);
});
test('multi-position slots preserve IDs, types, order, unknown fields and all coordinate pairs',()=>{
 const source=structuredClone(hull);source.weaponSlots[0].locations=[5,12,8,-9,-11,4];source.weaponSlots[0].extra={keep:true};const p=fromShip(source,image);
 assert.deepEqual(validate(p).errors,[]);assert.deepEqual(toShip(p),source);assert.deepEqual(slotPoints(p.hull.weaponSlots[0].locations),[[5,12],[8,-9],[-11,4]]);
 const locations=p.hull.weaponSlots[0].locations;p.hull.weaponSlots[0].locations=moveSlot(locations,[12,9]);assert.deepEqual(p.hull.weaponSlots[0].locations,[12,9,15,-12,-4,1]);assert.deepEqual(locations,[5,12,8,-9,-11,4]);
 const reflected=mirror(p,p.hull.weaponSlots[0]);assert.deepEqual(reflected.locations,[12,-9,15,12,-4,-1]);assert.notEqual(reflected.id,p.hull.weaponSlots[0].id);assert.deepEqual(reflected.extra,{keep:true});
 resize(p,2);assert.deepEqual(p.hull.weaponSlots[0].locations,[24,18,30,-24,-8,2]);
});
test('all positions participate in validation and overflow checks',()=>{
 for(const locations of [[1,2,3],[1,2,Infinity,4],[],[1,2,'3',4]]){const p=fromShip(hull,image);p.hull.weaponSlots[0].locations=locations as Locations;assert.ok(validate(p).errors.length);}
 const p=fromShip(hull,image);p.hull.weaponSlots[0].locations=[1,2,1e308,1e308];p.hull.center=[1,1e308];assert.match(validate(p).errors.join(),/overflow/);
 assert.throws(()=>moveSlot([-1e308,0,1e308,0],[1e308,0]),/finite/);
});
test('paired zero-size engine markers preserve source semantics while malformed sizes reject',()=>{
 const source=structuredClone(hull);source.engineSlots[0].width=0;source.engineSlots[0].length=0;
 const p=fromShip(source,image);assert.deepEqual(validate(p).errors,[]);assert.match(validate(p).warnings.join(),/zero-size/);assert.deepEqual(toShip(p),source);
 p.hull.engineSlots[0].width=-1;assert.ok(validate(p).errors.length);p.hull.engineSlots[0].width=1;assert.ok(validate(p).errors.length);
});
