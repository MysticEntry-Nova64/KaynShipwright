import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fromShip,toShip,validate,moveSlot,mirror,resize,slotPoints,parseProject} from '../src/core.ts';
import type {Locations} from '../src/core.ts';
const hull=JSON.parse(fs.readFileSync(new URL('../assets/verdant.ship',import.meta.url),'utf8'));
const image='data:image/png;base64,AA==';
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
