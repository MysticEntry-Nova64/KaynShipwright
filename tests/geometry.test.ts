import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fromShip,validate,resize,clone,toScreen,toGame} from '../src/core.ts';
import {edit,addEngine,copyEngine,insertVertex,rectangleBounds,outlineErrors} from '../src/geometry.ts';
import {DocumentSession} from '../src/document-session.ts';
const hull=JSON.parse(fs.readFileSync(new URL('../assets/verdant.ship',import.meta.url),'utf8'));
const make=()=>fromShip(hull,'data:image/png;base64,AA==');
test('validation is total for malformed JSON structures',()=>{
 for(const bad of [null,0,'text',[],{version:1,hull:[]},{...make(),hull:{...hull,engineSlots:[null]}},{...make(),hull:{...hull,bounds:[0,0,1,1]}}])assert.ok(validate(bad).errors.length);
 for(const field of ['weaponSlots','engineSlots','bounds','shieldCenter','center']){const p=make();p.hull[field]=null;assert.ok(validate(p).errors.length,field);}
});
test('failed resize and geometry commands preserve original data',()=>{const p=make(),before=clone(p);assert.throws(()=>resize(p,1e308));assert.deepEqual(p,before);assert.throws(()=>edit(p,q=>q.hull.engineSlots[0].width=-1));assert.deepEqual(p,before);});
test('engine add, mirror and duplicate preserve unknown properties',()=>{const p=make();p.hull.engineSlots[0].custom={retained:true};copyEngine(p,0,true);assert.deepEqual(p.hull.engineSlots[2].location,[-141.0938,18.0475]);assert.equal(p.hull.engineSlots[2].angle,-180);assert.deepEqual(p.hull.engineSlots[2].custom,{retained:true});copyEngine(p,0);assert.notDeepEqual(p.hull.engineSlots[3].location,p.hull.engineSlots[0].location);addEngine(p,[-100,0]);assert.equal(validate(p).errors.length,0);});
test('polygon rejects crossing, repeated, degenerate and overlapping edges',()=>{
 for(const b of [[0,0,1,1],[0,0,2,2,0,2,2,0],[0,0,0,0,1,1],[0,0,1,0,2,0],[0,0,3,0,2,0,2,2,0,2]])assert.ok(outlineErrors(b).length,JSON.stringify(b));
 assert.deepEqual(outlineErrors([]),[]);assert.deepEqual(outlineErrors([0,0,4,0,4,4,2,2,0,4]),[]);
});
test('rectangle, projected insertion, and coordinate inverse on all quadrants',()=>{const p=make();rectangleBounds(p);const before=p.hull.bounds.length;const index=insertVertex(p,[0,200]);assert.equal(p.hull.bounds.length,before+2);assert.equal(p.hull.bounds[index*2+1],120);assert.equal(validate(p).errors.length,0);for(const q of [[0,0],[-40,10],[20,-30],[-10,-20],[80,90]] as [number,number][])assert.deepEqual(toGame(p,toScreen(p,q)),q);});
test('serialized saves own their exact snapshot, including an older undo revision',()=>{
 const s=new DocumentSession();s.load();s.change();const a=s.beginSave();s.finishSave(a);
 s.change();const b=s.beginSave();s.finishSave(b);s.restore(a.revision);assert.equal(s.dirty,true);
 s.finishSave(s.beginSave());assert.equal(s.dirty,false);s.restore(b.revision);assert.equal(s.dirty,true);
 const current=s.beginSave();s.change();s.finishSave(current);assert.equal(s.dirty,true);
 s.load(true);s.finishSave(current);assert.equal(s.dirty,true);
});
test('only latest load generation with no intervening edit may publish',()=>{const s=new DocumentSession();s.load();const first=s.beginLoad(),last=s.beginLoad();assert.equal(s.accepts(first),false);assert.equal(s.accepts(last),true);s.change();assert.equal(s.accepts(last),false);const t=s.beginLoad();s.load();assert.equal(s.accepts(t),false);});
