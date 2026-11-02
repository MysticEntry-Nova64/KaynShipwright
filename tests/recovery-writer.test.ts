import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RecoveryWriter} from '../src/recovery-writer.ts';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {resolve = done;});
  return {promise, resolve};
}

test('recovery coalesces blocked revisions and flush waits for the newest snapshot',async()=>{
  const first=gate(),latest=gate(),written:number[]=[],settled:unknown[]=[];
  const writer=new RecoveryWriter<{revision:number}>(async value=>{
    written.push(value.revision);
    await (value.revision===0?first:latest).promise;
  },outcome=>settled.push(outcome.ok?undefined:outcome.error));
  writer.enqueue({revision:0});await Promise.resolve();
  const drain=writer.flush();
  for(let revision=1;revision<=1000;revision++)writer.enqueue({revision});
  assert.strictEqual(writer.flush(),drain);
  assert.deepEqual(written,[0]);assert.deepEqual(settled,[]);
  first.resolve();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(written,[0,1000]);assert.deepEqual(settled,[]);
  latest.resolve();await drain;
  assert.deepEqual(settled,[undefined]);
});

test('failed obsolete write continues to the latest state and later runs still work',async()=>{
  const first=gate(),written:number[]=[],settled:unknown[]=[];
  const writer=new RecoveryWriter<number>(async value=>{
    written.push(value);
    if(value===0){await first.promise;throw Error('obsolete write failed');}
  },outcome=>settled.push(outcome.ok?undefined:outcome.error));
  writer.enqueue(0);await Promise.resolve();writer.enqueue(1);writer.enqueue(2);
  const drain=writer.flush();first.resolve();await drain;
  assert.deepEqual(written,[0,2]);assert.deepEqual(settled,[undefined]);
  writer.enqueue(3);await writer.flush();assert.deepEqual(written,[0,2,3]);
});

test('final failure rejects flush, reports once and permits a successful retry',async()=>{
  const failure=Error('disk unavailable'),settled:unknown[]=[];let fail=true;
  const writer=new RecoveryWriter<number>(()=>{
    if(fail)throw failure;
    return Promise.resolve(true);
  },outcome=>settled.push(outcome.ok?undefined:outcome.error));
  writer.enqueue(1);await assert.rejects(writer.flush(),error=>error===failure);
  assert.deepEqual(settled,[failure]);
  fail=false;writer.enqueue(2);await writer.flush();assert.deepEqual(settled,[failure,undefined]);
});

test('a rejection with undefined remains a failure rather than succeeding',async()=>{
  const outcomes:boolean[]=[];
  const writer=new RecoveryWriter<number>(()=>Promise.reject(undefined),outcome=>outcomes.push(outcome.ok));
  writer.enqueue(1);
  let rejected=false;await writer.flush().catch(()=>{rejected=true;});
  assert.equal(rejected,true);
  assert.deepEqual(outcomes,[false]);
});
