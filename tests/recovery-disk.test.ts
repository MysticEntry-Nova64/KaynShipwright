import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RecoveryWriter } from '../src/recovery-writer.ts';

const { createWorkspaceStore } = createRequire(import.meta.url)('../native/workspace-service.cjs');
async function workspace() {
  return {
    format: 1, active: 0,
    documents: [{
      id: 'disk-regression', dirty: true, zoom: 1, selected: '', tool: 'bounds',
      project: {
        version: 1,
        image: 'data:image/png;base64,' + (await fs.readFile(new URL('../assets/verdant.png', import.meta.url))).toString('base64'),
        hull: JSON.parse(await fs.readFile(new URL('../assets/verdant.ship', import.meta.url), 'utf8')),
      },
    }],
  };
}
function gate() {
  let resolve!: () => void;
  return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
}
async function waitFor(promise: Promise<void>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(Error(`${label} timed out`)), 5_000);
    })]);
  } finally { clearTimeout(timer); }
}

test('queued recovery owns submitted values and preserves exact latest and previous snapshots', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shipwright-queued-recovery-'));
  try {
    const store = createWorkspaceStore(directory), value = await workspace();
    const expected: unknown[] = [], pending: Promise<unknown>[] = [];
    for (let revision = 0; revision < 16; revision++) {
      value.documents[0].project.hull.hullName = `Queued revision ${revision} 🚀`;
      value.documents[0].dirty = revision % 2 === 0;
      expected.push(structuredClone(value)); pending.push(store.write(value));
    }
    value.documents[0].project.hull.hullName = 'Never submitted';
    await Promise.all(pending);
    assert.deepEqual((await store.read()).workspace, expected[15]);
    const file = path.join(directory, 'workspace-v1.json');
    assert.deepEqual(JSON.parse(await fs.readFile(file + '.previous', 'utf8')), expected[14]);
    await fs.writeFile(file, '{incomplete');
    const recovered = await store.read();
    assert.deepEqual(recovered.workspace, expected[14]); assert.match(recovered.warning, /previous/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('rejected recovery publication preserves disk state and permits the following write', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shipwright-recovery-retry-'));
  const rename = fs.rename;
  try {
    const store = createWorkspaceStore(directory), initial = await workspace();
    await store.write(initial);
    const file = path.join(directory, 'workspace-v1.json');
    const before = await fs.readFile(file), rejected = structuredClone(initial);
    rejected.documents[0].project.hull.hullName = 'Must not publish';
    fs.rename = async (source, destination) => {
      if (destination === file) throw Error('Injected latest recovery replacement failure');
      return rename(source, destination);
    };
    try { await assert.rejects(store.write(rejected), /Injected latest recovery replacement/); }
    finally { fs.rename = rename; }
    assert.deepEqual(await fs.readFile(file), before);
    assert.deepEqual((await store.read()).workspace, initial);
    const next = structuredClone(initial); next.documents[0].project.hull.hullName = 'Successful retry';
    await store.write(next);
    assert.deepEqual((await store.read()).workspace, next);
    assert.deepEqual(JSON.parse(await fs.readFile(file + '.previous', 'utf8')), initial);
    assert.deepEqual((await fs.readdir(directory)).sort(), ['workspace-v1.json', 'workspace-v1.json.previous']);
  } finally { fs.rename = rename; await fs.rm(directory, { recursive: true, force: true }); }
});

test('coalesced recovery flush waits for the latest snapshot to reach the real disk store', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shipwright-flush-disk-'));
  const started = gate(), releaseFirst = gate(), latestStarted = gate(), releaseLatest = gate();
  const settled = gate(); let enqueued = false;
  let drain: Promise<void> | undefined;
  try {
    const store = createWorkspaceStore(directory), first = await workspace();
    const values: unknown[] = [], outcomes: boolean[] = [];
    const writer = new RecoveryWriter<typeof first>(async value => {
      values.push(structuredClone(value));
      if (values.length === 1) { started.resolve(); await releaseFirst.promise; }
      else { latestStarted.resolve(); await releaseLatest.promise; }
      await store.write(value);
    }, outcome => { outcomes.push(outcome.ok); settled.resolve(); });
    writer.enqueue(first); enqueued = true; await waitFor(started.promise, 'first write');
    let last = first;
    for (let revision = 1; revision <= 64; revision++) {
      last = structuredClone(first); last.documents[0].project.hull.hullName = `Coalesced revision ${revision}`;
      writer.enqueue(last);
    }
    let flushed = false;
    drain = writer.flush().then(() => { flushed = true; });
    void drain.catch(() => {});
    releaseFirst.resolve(); await waitFor(latestStarted.promise, 'latest write');
    assert.equal(flushed, false); assert.deepEqual(outcomes, []);
    assert.deepEqual((await store.read()).workspace, first);
    releaseLatest.resolve(); await waitFor(drain, 'flush');
    assert.deepEqual(values, [first, last]);
    assert.deepEqual((await store.read()).workspace, last); assert.deepEqual(outcomes, [true]);
  } finally {
    releaseFirst.resolve(); releaseLatest.resolve();
    // Cleanup must not trust the flush contract that this test is trying to reject.
    if (enqueued) await waitFor(settled.promise, 'writer cleanup');
    await fs.rm(directory, { recursive: true, force: true });
  }
});
