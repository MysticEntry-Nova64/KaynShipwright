import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fromShip,parseProject,toShip,resize,validate} from '../src/core.ts';

const require=createRequire(import.meta.url);
const {parseShip,prepare,createLibrary}=require('../import-service.cjs');
const {exportPackage}=require('../package-service.cjs');
const fixture=JSON.parse(await fs.readFile(new URL('../assets/verdant.ship',import.meta.url),'utf8'));
const image='data:image/png;base64,'+(await fs.readFile(new URL('../assets/verdant.png',import.meta.url))).toString('base64');

test('ordinary project loads, hull export and scaling reject nonfinite unknown fields',()=>{
 const project={version:1 as const,image,hull:structuredClone(fixture)};
 project.hull.unknown={nested:[Infinity]};
 assert.match(validate(project).errors.join(),/nonfinite/);
 assert.throws(()=>fromShip(project.hull,image),/nonfinite/);
 assert.throws(()=>toShip(project),/nonfinite/);
 const before=structuredClone(project);assert.throws(()=>resize(project,1.2),/nonfinite/);assert.deepEqual(project,before);
 const text=JSON.stringify({...project,hull:{...project.hull,unknown:'TOKEN'}}).replace('"TOKEN"','1e400');
 assert.throws(()=>parseProject(text),/nonfinite/);
});

test('version metadata changes cannot silently change dependency overrides',async()=>{
 const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
 const lock=JSON.parse(await fs.readFile(new URL('../package-lock.json',import.meta.url),'utf8'));
 for(const [name,version] of Object.entries(pkg.overrides)){
  assert.equal(lock.packages['node_modules/'+name].version,version,'override/lock mismatch for '+name);
  assert.equal(require(name+'/package.json').version,version,'override/installed mismatch for '+name);
 }
});

test('unknown nonfinite JSON values are rejected rather than silently changed to null',async()=>{
 assert.throws(()=>parseShip('{"unknown":1e400}'),/nonfinite/);
 assert.throws(()=>parseShip('{"unknown":[1, {"bad":-1e400}]}'),/nonfinite/);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shipwright-audit-json-'));
 try{
  const project={version:1,image,hull:{...fixture,unknown:Infinity}};
  await assert.rejects(()=>exportPackage(dir,project,image),/nonfinite/);
  assert.deepEqual(await fs.readdir(dir),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('cyclic and nonfinite library inputs fail before staging anything',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shipwright-audit-stage-'));
 try{
  const lib=createLibrary(dir),project:any={version:1,image,hull:structuredClone(fixture)};
  project.self=project;await assert.rejects(()=>lib.add({project,fingerprint:'cycle'}),/circular/i);
  delete project.self;project.hull.extra=NaN;await assert.rejects(()=>lib.add({project,fingerprint:'nan'}),/nonfinite/);
  assert.deepEqual(await fs.readdir(dir),[]);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('metadata list remains compatible with immutable 1.1.0 entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shipwright-audit-legacy-'));
 try{
  const lib=createLibrary(dir),result=await lib.add({project:{version:1,image,hull:fixture},fingerprint:'legacy'});
  const entryFile=path.join(dir,result.entry.id,'entry.json'),original=await fs.readFile(entryFile);
  await fs.unlink(path.join(dir,result.entry.id,'summary.json'));
  assert.equal((await lib.list()).entries.length,1);assert.deepEqual(await fs.readFile(entryFile),original);
  assert.equal((await lib.get(result.entry.id)).project.image,image);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('published summaries do not read large project files on each library refresh',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shipwright-audit-summary-'));
 try{
  const lib=createLibrary(dir),result=await lib.add({project:{version:1,image,hull:fixture},fingerprint:'summary'});
  const file=path.join(dir,result.entry.id,'entry.json'),original=await fs.readFile(file);
  // A list uses metadata; opening still validates the actual project and reports corruption.
  await fs.writeFile(file,'corrupt');assert.equal((await lib.list()).entries.length,1);await assert.rejects(()=>lib.get(result.entry.id));
  await fs.writeFile(file,original);assert.equal((await lib.get(result.entry.id)).project.image,image);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
