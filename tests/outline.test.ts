import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateOutline} from '../src/auto-outline.ts';
import {outlineErrors} from '../src/geometry.ts';
const mask=(rows:string[])=>({width:rows[0].length,height:rows.length,alpha:Uint8Array.from(rows.join(''),c=>c==='#'?255:0)});
test('contour preserves concavity and produces a simple polygon',()=>{
 const m=mask(['########','########','###.....','###.....','########','########']);
 const r=generateOutline(m);assert.equal(r.method,'contour');assert.ok(r.points.length>4);assert.deepEqual(outlineErrors(r.points.flat()),[]);
});
test('disconnected substantial hull components use a convex fallback',()=>{
 const r=generateOutline(mask(['###...###','###...###','###...###']));assert.equal(r.method,'convex');assert.match(r.reason!,/Disconnected/);assert.deepEqual(outlineErrors(r.points.flat()),[]);
});
test('empty masks fail explicitly and diagonal touching cannot create a self-touching outline',()=>{
 assert.throws(()=>generateOutline(mask(['...','...'])),/No opaque/);const r=generateOutline(mask(['##.','###','.##']));assert.deepEqual(outlineErrors(r.points.flat()),[]);
});
test('opacity threshold is independent of artwork color and work is bounded',()=>{
 const m={width:2,height:2,alpha:Uint8Array.from([128,255,127,0])};assert.deepEqual(outlineErrors(generateOutline(m).points.flat()),[]);assert.throws(()=>generateOutline({width:513,height:513,alpha:new Uint8Array(513*513)}),/Invalid/);
});
