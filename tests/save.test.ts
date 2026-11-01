import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const {saveFile}=createRequire(import.meta.url)('../save-service.cjs');

test('staged saves preserve the old file on write, readback and replacement failures',async()=>{
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'shipwright-save-test-'));
 const destination=path.join(parent,'project.json'),old='{"name":"previous"}',next='{"name":"new"}';
 const write=fs.writeFile,read=fs.readFile,rename=fs.rename,rm=fs.rm;
 try{
  await write(destination,old);await saveFile(destination,next);assert.equal(await read(destination,'utf8'),next);
  for(const failure of ['partial write','readback','rename']){
   await write(destination,old);
   if(failure==='partial write')fs.writeFile=async(...args:any[])=>{await (write as any)(args[0],Buffer.from('{'),args[2]);throw Error('Injected partial write');};
   if(failure==='readback')fs.readFile=(async()=>Buffer.from('wrong')) as any;
   if(failure==='rename')fs.rename=async()=>{throw Error('Injected rename');};
   try{await assert.rejects(()=>saveFile(destination,next));}
   finally{fs.writeFile=write;fs.readFile=read;fs.rename=rename;}
   assert.equal(await read(destination,'utf8'),old,failure);
   assert.deepEqual(await fs.readdir(parent),['project.json'],failure+' cleanup');
  }
  fs.rename=async()=>{throw Error('Injected replacement failure');};fs.rm=async()=>{throw Error('Injected cleanup failure');};
  try{await assert.rejects(()=>saveFile(destination,next),(error:any)=>error instanceof AggregateError&&error.errors.length===2&&/temporary data/.test(error.message));}
  finally{fs.rename=rename;fs.rm=rm;}
  assert.equal(await read(destination,'utf8'),old);
  const stages=(await fs.readdir(parent)).filter(name=>name.startsWith('.shipwright-save-'));
  assert.equal(stages.length,1);await rm(path.join(parent,stages[0]),{recursive:true});
  const warnings:unknown[][]=[],warn=console.warn;console.warn=(...args)=>{warnings.push(args);};fs.rm=async()=>{throw Error('Injected post-publication cleanup failure');};
  try{assert.equal(await saveFile(destination,next),true);assert.equal(await read(destination,'utf8'),next);assert.equal(warnings.length,1);}
  finally{console.warn=warn;fs.rm=rm;}
 }finally{fs.writeFile=write;fs.readFile=read;fs.rename=rename;fs.rm=rm;await rm(parent,{recursive:true,force:true});}
});
