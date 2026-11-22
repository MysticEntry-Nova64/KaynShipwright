import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork, type ChildProcess } from 'node:child_process';

const fixture = fileURLToPath(new URL('./fixtures/save-crash-child.cjs', import.meta.url));
const oldText = JSON.stringify({ revision: 'old', keep: 'previous complete design' });
const nextText = JSON.stringify({ revision: 'new', unicode: 'é 🚀 水'.repeat(128), nested: [null, false, 17] });

async function stopAndWait(child: ChildProcess) {
  if (child.pid === undefined) return; // A failed spawn owns no process to terminate.
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Owned child ${child.pid} did not exit`)), 5_000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.kill();
  });
}

for (const boundary of ['before-write', 'after-partial-write', 'after-write', 'after-rename']) {
  test(`process termination at ${boundary} leaves a complete published design`, { timeout: 30_000 }, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shipwright-crash-'));
    try {
      for (let repeat = 0; repeat < 3; repeat++) {
        const owned = path.join(directory, String(repeat));
        await fs.mkdir(owned);
        const destination = path.join(owned, 'design.json');
        await fs.writeFile(destination, oldText);
        const child = fork(fixture, [boundary, destination, nextText], {
          execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        let diagnostics = '';
        child.stderr?.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-8_000); });
        try {
          await new Promise<void>((resolve, reject) => {
            const finish = (error?: Error) => {
              clearTimeout(timer);
              child.off('exit', earlyExit); child.off('error', spawnError); child.off('message', ready);
              error ? reject(error) : resolve();
            };
            const earlyExit = (code: number | null) => finish(Error(`Child exited before barrier (${code}): ${diagnostics}`));
            const spawnError = (error: Error) => finish(error);
            const ready = (message: any) => {
              finish(message?.boundary === boundary && message?.pid === child.pid ? undefined : Error('Wrong child/barrier acknowledgement'));
            };
            const timer = setTimeout(() => finish(Error(`Barrier timed out: ${diagnostics}`)), 10_000);
            child.once('exit', earlyExit); child.once('error', spawnError); child.once('message', ready);
          });
        } finally {
          // Reap this exact child before reading or deleting its directory.
          await stopAndWait(child);
        }
        assert.ok(child.exitCode !== null || child.signalCode !== null, 'termination observed');
        assert.equal(diagnostics, '', 'fixture must reach its intended barrier without an earlier error');
        assert.equal(await fs.readFile(destination, 'utf8'), boundary === 'after-rename' ? nextText : oldText);
        const stages = (await fs.readdir(owned)).filter(name => name.startsWith('.shipwright-save-'));
        assert.equal(stages.length, 1, 'death bypasses finally; orphan staging is not published data');
        if (boundary === 'after-write') assert.equal(await fs.readFile(path.join(owned, stages[0], 'document'), 'utf8'), nextText);
        if (boundary === 'after-partial-write') {
          assert.deepEqual(await fs.readFile(path.join(owned, stages[0], 'document')), Buffer.from(nextText).subarray(0, Math.floor(Buffer.byteLength(nextText) / 2)));
        }
      }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
}
