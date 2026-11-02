const {fileAction,revealSettings}=require('./studio-test-helpers.cjs');
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

// A disposable Electron profile and one deliberately delayed recovery write.
// Exercise the real renderer, bridge and native workspace store, not a queue model.
(async () => {
  const root = path.resolve(__dirname, '..');
  const out = process.env.SHIPWRIGHT_MEMORY_OUTPUT;
  assert(out && path.isAbsolute(out), 'Set an absolute SHIPWRIGHT_MEMORY_OUTPUT');
  const profile = path.join(out, 'profile');
  await fs.mkdir(profile, { recursive: true });
  const hull = JSON.parse(await fs.readFile(path.join(root, 'assets/verdant.ship'), 'utf8'));
  const image = 'data:image/png;base64,' + (await fs.readFile(path.join(root, 'assets/verdant.png'))).toString('base64');
  const project = {version: 1, hull, image};
  hull.hullName = 'Recovery memory baseline';
  await fs.writeFile(path.join(profile, 'workspace-v1.json'), JSON.stringify({
    format: 1, active: 0, documents: [{id: 'memory-audit', project, dirty: true,
      zoom: 1, selected: '', tool: 'weapons', autoAttempted: true}]
  }));
  const env = {...process.env, SHIPWRIGHT_USER_DATA: profile};
  delete env.ELECTRON_RUN_AS_NODE;
  let app, cdp;
  const errors = [];

  function inspectSnapshot(snapshot) {
    const {nodes, edges, strings} = snapshot;
    const nf = snapshot.snapshot.meta.node_fields, ef = snapshot.snapshot.meta.edge_fields;
    const ns = nf.length, es = ef.length;
    const nt = nf.indexOf('type'), nn = nf.indexOf('name'), nc = nf.indexOf('edge_count');
    const et = ef.indexOf('type'), en = ef.indexOf('name_or_index'), to = ef.indexOf('to_node');
    const nodeTypes = snapshot.snapshot.meta.node_types[nt];
    const edgeTypes = snapshot.snapshot.meta.edge_types[et];
    const starts = new Uint32Array(nodes.length / ns);
    let edge = 0;
    for (let n = 0; n < nodes.length; n += ns) {starts[n / ns] = edge; edge += nodes[n + nc] * es;}
    function property(offset, name) {
      for (let e = starts[offset / ns], end = e + nodes[offset + nc] * es; e < end; e += es) {
        if (edgeTypes[edges[e + et]] === 'property' && strings[edges[e + en]] === name) return edges[e + to];
      }
    }
    function firstElement(offset) {
      for (let e = starts[offset / ns], end = e + nodes[offset + nc] * es; e < end; e += es) {
        if (edgeTypes[edges[e + et]] === 'element' && edges[e + en] === 0) return edges[e + to];
      }
    }
    const candidates = [];
    for (let n = 0; n < nodes.length; n += ns) {
      if (nodeTypes[nodes[n + nt]] !== 'object' || property(n, 'format') === undefined || property(n, 'active') === undefined) continue;
      const docs = property(n, 'documents');
      if (docs === undefined) continue;
      const doc = firstElement(docs), p = doc === undefined ? undefined : property(doc, 'project');
      const h = p === undefined ? undefined : property(p, 'hull');
      const name = h === undefined ? undefined : property(h, 'hullName');
      if (name !== undefined && strings[nodes[name + nn]].startsWith('Recovery audit ')) candidates.push(n);
    }
    // Shortest strong retaining path from GC roots. Skip weak edges explicitly.
    const parents = new Int32Array(nodes.length / ns).fill(-1);
    const parentEdges = new Int32Array(parents.length).fill(-1);
    const queue = [0]; parents[0] = 0;
    const targets = new Set(candidates);
    let found;
    for (let head = 0; head < queue.length && found === undefined; head++) {
      const n = queue[head];
      if (targets.has(n)) { found = n; break; }
      for (let e = starts[n / ns], end = e + nodes[n + nc] * es; e < end; e += es) {
        if (edgeTypes[edges[e + et]] === 'weak') continue;
        const dest = edges[e + to];
        if (parents[dest / ns] !== -1) continue;
        parents[dest / ns] = n; parentEdges[dest / ns] = e; queue.push(dest);
      }
    }
    const retainingPath = [];
    if (found !== undefined) {
      for (let n = found; n !== 0; n = parents[n / ns]) {
        const e = parentEdges[n / ns];
        retainingPath.push({node: strings[nodes[n + nn]], edgeType: edgeTypes[edges[e + et]],
          edge: ['element', 'hidden'].includes(edgeTypes[edges[e + et]]) ? String(edges[e + en]) : strings[edges[e + en]]});
      }
      retainingPath.reverse();
    }
    return {pendingWorkspaceSnapshots: candidates.length, retainingPath};
  }

  async function measure(label) {
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics = await cdp.send('Runtime.getHeapUsage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const chunks = [];
    const listener = data => chunks.push(data.chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', listener);
    try { await cdp.send('HeapProfiler.takeHeapSnapshot', {reportProgress: false}); }
    finally { cdp.off('HeapProfiler.addHeapSnapshotChunk', listener); }
    const raw = chunks.join('');
    await fs.writeFile(path.join(out, label + '.heapsnapshot'), raw);
    return {label, metrics, dom, ...inspectSnapshot(JSON.parse(raw))};
  }

  try {
    app = await _electron.launch(process.env.SHIPWRIGHT_EXECUTABLE
      ? {executablePath: process.env.SHIPWRIGHT_EXECUTABLE, args: [], env}
      : {args: [root], env});
    const page = await app.firstWindow();await revealSettings(page);
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => document.getElementById('name').value === 'Recovery memory baseline');
    cdp = await page.context().newCDPSession(page);
    const runtime = await page.evaluate(() => navigator.userAgent);
    const pids = await app.evaluate(({app}) => ({main: process.pid, metrics: app.getAppMetrics().map(m => ({pid: m.pid, type: m.type}))}));
    await app.evaluate(({ipcMain}) => {
      const original = ipcMain._invokeHandlers.get('workspace-write');
      globalThis.__memoryAudit = {received: [], release: undefined};
      ipcMain.removeHandler('workspace-write');
      ipcMain.handle('workspace-write', async (event, value) => {
        const audit = globalThis.__memoryAudit;
        audit.received.push(value.documents[0].project.hull.hullName);
        if (audit.received.length === 1) await new Promise(resolve => {audit.release = resolve;});
        return original(event, value);
      });
    });
    const before = await measure('before');
    for (let i = 0; i < 13; i++) {
      await page.evaluate(i => {
        const name = document.getElementById('name');
        name.value = 'Recovery audit ' + String(i).padStart(2, '0');
        name.dispatchEvent(new Event('change'));
      }, i);
      // Cross the real 350ms autosave debounce before the next edit.
      await page.waitForTimeout(425);
    }
    const blocked = await measure('blocked');
    const receivedWhileBlocked = await app.evaluate(() => globalThis.__memoryAudit.received.length);
    assert.equal(receivedWhileBlocked, 1, 'One actual IPC write must be blocked');
    await app.evaluate(() => globalThis.__memoryAudit.release());
    // Status can become up-to-date after an older write; verify the actual file.
    let saved;
    for (let attempt = 0; attempt < 150; attempt++) {
      saved = JSON.parse(await fs.readFile(path.join(profile, 'workspace-v1.json'), 'utf8'));
      if (saved.documents[0].project.hull.hullName === 'Recovery audit 12') break;
      await page.waitForTimeout(100);
    }
    await page.locator('#workspaceState').filter({hasText: 'up to date'}).waitFor();
    const received = await app.evaluate(() => [...globalThis.__memoryAudit.received]);
    assert.equal(saved.documents[0].project.hull.hullName, 'Recovery audit 12');
    const drained = await measure('drained');
    await page.screenshot({path: path.join(out, 'verified-workspace.png')});
    const result = {runtime, pids, operations: 13, receivedWhileBlocked, received,
      savedName: saved.documents[0].project.hull.hullName, before, blocked, drained, errors,
      bounded: blocked.pendingWorkspaceSnapshots <= 2};
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    assert.deepEqual(errors, []);
    assert(blocked.pendingWorkspaceSnapshots <= 2, 'Recovery retains more than active + latest pending workspace');
    assert(drained.pendingWorkspaceSnapshots <= 1, 'Expired recovery snapshots remain after draining');
  } finally {
    await cdp?.detach().catch(() => {});
    await app?.evaluate(({app}) => {globalThis.__memoryAudit?.release?.(); app.exit(0);}).catch(() => {});
    await app?.close().catch(() => {});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
