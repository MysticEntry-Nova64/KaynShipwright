const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

(async () => {
  const root = path.resolve(__dirname, '..');
  const out = path.resolve(process.env.SHIPWRIGHT_STATE_ARTWORK_OUTPUT || path.join(root, 'test-results', 'state-artwork-' + Date.now()));
  await fs.mkdir(out, { recursive: false });
  const receipt = { passed: false, root, out, boundary: 'Actual source or explicitly selected packaged executable through a hidden test bootstrap; no OS input', checks: [], captures: [], children: [], pageErrors: [], responses: [] };
  const executable = process.env.SHIPWRIGHT_EXECUTABLE ? path.resolve(process.env.SHIPWRIGHT_EXECUTABLE) : null;
  receipt.mode = executable ? 'packaged executable' : 'source application';
  // Match the installed Playwright default Electron loader's hidden-window flags.
  const packagedChromiumArgs=['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'];
  receipt.chromiumArgs=executable ? packagedChromiumArgs : [];
  receipt.boundary = executable ? 'Actual packaged main/preload/renderer via opt-in isolated hidden smoke mode and disposable profile; no OS input' : 'Actual source main/preload/renderer via hidden bootstrap and disposable profile; no OS input';
  if (executable) receipt.packageBefore = { executable, exeSha256: hash(await fs.readFile(executable)), archive: path.join(path.dirname(executable),'resources/app.asar'), archiveSha256: hash(await fs.readFile(path.join(path.dirname(executable),'resources/app.asar'))) };
  const manifestPath = path.join(root, 'assets/ui/state-artwork-2026-11-22/manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.ok(manifest.close?.files?.length === 2, 'Selected close artwork must be supplied before this check runs');
  const assets = [manifest.location, ...manifest.close.files];
  const watchedFiles = ['main.cjs', 'preload.cjs', 'src/editor.ts', 'src/startup.ts', 'src/dialog-artwork.ts', 'src/studio-ui.ts', 'app.js', 'index.html', 'style.css', 'studio.css', 'package.json', 'package-lock.json', 'tests/state-artwork-ui.cjs', 'tests/fixtures/hidden-app.cjs', 'assets/ui/state-artwork-2026-11-22/manifest.json', ...assets.map(item => 'assets/ui/state-artwork-2026-11-22/' + item.file)];
  receipt.sourceBefore = await Promise.all(watchedFiles.map(async file => { const data = await fs.readFile(path.join(root, file)); return { file, sha256: hash(data), bytes: data.length }; }));
  await fs.writeFile(path.join(out, 'before-execution.json'), JSON.stringify(receipt.sourceBefore, null, 2));
  let app, page;
  const pending = [];
  function phase(value) { receipt.phase = value; console.log('phase:', value); }
  async function launch(profile) {
    const env = { ...process.env, SHIPWRIGHT_USER_DATA: profile, SHIPWRIGHT_LOCATION_CANDIDATES: '[]' };
    delete env.ELECTRON_RUN_AS_NODE;
    if(executable)env.SHIPWRIGHT_TEST_HIDDEN='1';else delete env.SHIPWRIGHT_TEST_HIDDEN;
    app = await _electron.launch(executable ? { executablePath: executable, args: packagedChromiumArgs, cwd: root, env, timeout: 15000 } : { args: [path.join(root, 'tests/fixtures/hidden-app.cjs')], cwd: root, env, timeout: 15000 });
    page = await app.firstWindow(); page.setDefaultTimeout(10000);
    const captureScheduling=await app.evaluate(({BrowserWindow}) => { const windows=global.__shipwrightHiddenWindows ?? BrowserWindow.getAllWindows(); for(const window of windows)window.webContents.setBackgroundThrottling(false); return windows.map(window=>({visible:window.isVisible(),focused:window.isFocused(),backgroundThrottling:window.webContents.getBackgroundThrottling()})); });
    assert.equal(captureScheduling.length,1,'One owned window must receive the capture scheduling override');
    for(const state of captureScheduling){assert.equal(state.visible,false);assert.equal(state.focused,false);assert.equal(state.backgroundThrottling,false);}
    (receipt.captureScheduling ??= []).push({reason:'Owned hidden-window screenshot readiness; no performance claim',windows:captureScheduling});
    page.on('pageerror', error => receipt.pageErrors.push(error.message));
    page.on('response', response => {
      if (!response.url().includes('/state-artwork-2026-11-22/')) return;
      pending.push((async () => { try { receipt.responses.push({ url: response.url(), status: response.status(), sha256: hash(await response.body()) }); } catch (error) { receipt.responses.push({ url: response.url(), error: String(error) }); } })());
    });
    await page.waitForFunction(() => document.getElementById('count')?.textContent === '23' && document.getElementById('workspaceState').textContent !== 'Restoring workspace…');
    const runtime = await app.evaluate(({ app, BrowserWindow }) => ({ appPath: app.getAppPath(), packaged: app.isPackaged, version: app.getVersion(), executable: app.getPath('exe'), userData: app.getPath('userData'), hiddenSmoke: process.env.SHIPWRIGHT_TEST_HIDDEN === '1', electron: process.versions.electron, chromium: process.versions.chrome, windows: (app.isPackaged ? BrowserWindow.getAllWindows() : global.__shipwrightHiddenWindows).map(window => ({ visible: window.isVisible(), focused: window.isFocused() })) }));
    assert.equal(path.normalize(runtime.appPath), path.normalize(executable ? path.join(path.dirname(executable),'resources/app.asar') : root)); if(executable){assert.equal(runtime.packaged,true);assert.equal(runtime.version,require('../package.json').version);assert.equal(path.normalize(runtime.executable),path.normalize(executable));assert.equal(runtime.hiddenSmoke,true);} assert.equal(runtime.windows.length, 1); assert.ok(runtime.windows.every(window => !window.visible && !window.focused));
    assert.equal(path.normalize(runtime.userData), path.normalize(profile));
    const expectedRenderer=pathToFileURL(executable ? path.join(path.dirname(executable),'resources/app.asar/index.html') : path.join(root,'index.html')).href;
    assert.equal(page.url().toLowerCase(),expectedRenderer.toLowerCase());
    receipt.runtime = runtime; receipt.pageUrl = page.url();
    assert.equal(await page.locator('#assistantOpen, #assistantDialog, #assistantExpression, #assistantBackground').count(), 0);
  }
  async function shutdown() {
    if (!app) return;
    const child = app.process();
    const exited = child.exitCode === null ? new Promise(resolve => child.once('exit', resolve)) : Promise.resolve();
    const bounded = async (promise, milliseconds) => {
      let timer; try { return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Owned app cleanup timed out')),milliseconds);})]); } finally { clearTimeout(timer); }
    };
    await bounded(app.evaluate(({ app }) => app.exit(0)).catch(() => {}),2000).catch(error => { receipt.exitRequestLimit=error.message; });
    let forced=false;
    try { await bounded(exited,5000); } catch { forced=true; child.kill(); await bounded(exited,2000); }
    receipt.children.push({ pid: child.pid, code: child.exitCode, signal: child.signalCode, forced }); app = undefined;
    if(forced)throw Error('Owned app required forced termination');
  }
  async function imageState(id, pixels) {
    const requested = id === 'locationAssistant' ? manifest.location : manifest.close.files.find(item => item.size === pixels);
    assert.ok(requested, 'Expected size must have a declared canonical asset');
    await page.waitForFunction(({ id, suffix }) => { const image = document.getElementById(id); return image.complete && image.naturalWidth > 0 && image.currentSrc.endsWith(suffix); }, { id, suffix: '/' + requested.file });
    const state = await page.evaluate(async id => {
      await document.fonts.ready;
      const image = document.getElementById(id); await image.decode(); const box = image.getBoundingClientRect();
      return { src: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: box.width, height: box.height, objectFit: getComputedStyle(image).objectFit, alt: image.alt, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } };
    }, id);
    assert.equal(state.naturalWidth, pixels); assert.equal(state.naturalHeight, pixels); assert.equal(state.width, pixels); assert.equal(state.height, pixels); assert.equal(state.objectFit, 'contain');
    const expected = assets.find(item => state.src.endsWith('/' + item.file)); assert.ok(expected, 'Consumed image must be declared');
    const consumed = await page.evaluate(async url => { const response = await fetch(url); const bytes = await response.arrayBuffer(); return { status: response.status, hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('') }; }, state.src);
    assert.equal(consumed.status, 200); assert.equal(consumed.hash, expected.sha256); state.response = consumed;
    return state;
  }
  async function capture(name, selector) {
    const file = path.join(out, name + '.png');
    assert.equal(await page.evaluate(() => document.fonts.status),'loaded','Capture requires ready fonts');
    let clip,geometry;
    if(selector){
      geometry=await page.locator(selector).evaluate(element=>{const b=element.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};});
      assert.ok(geometry.right>geometry.left&&geometry.bottom>geometry.top&&geometry.left>=0&&geometry.top>=0&&geometry.right<=geometry.viewport.width&&geometry.bottom<=geometry.viewport.height,'Dialog capture bounds must be inside viewport');
      clip={x:Math.floor(geometry.left),y:Math.floor(geometry.top),width:Math.ceil(geometry.right)-Math.floor(geometry.left),height:Math.ceil(geometry.bottom)-Math.floor(geometry.top)};
    }
    const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
    assert.equal(viewport.dpr,1,'Native capture dimensions are checked at DPR1');
    const rect=clip??{x:0,y:0,width:viewport.width,height:viewport.height};
    let captureTimer;
    const native=await Promise.race([
      app.evaluate(async({app,BrowserWindow},rect)=>{
        const windows=app.isPackaged?BrowserWindow.getAllWindows():global.__shipwrightHiddenWindows;
        if(windows.length!==1)throw Error('Native capture requires one owned window');
        const window=windows[0],before={visible:window.isVisible(),focused:window.isFocused()};
        if(before.visible||before.focused)throw Error('Owned capture window must stay hidden');
        const image=await window.webContents.capturePage(rect,{stayHidden:true});
        const after={visible:window.isVisible(),focused:window.isFocused()};
        if(after.visible||after.focused||image.isEmpty())throw Error('Invalid hidden native capture');
        return {before,after,size:image.getSize(),contentBounds:window.getContentBounds(),png:image.toPNG().toString('base64')};
      },rect),
      new Promise((_,reject)=>{captureTimer=setTimeout(()=>reject(Error('Native hidden capture exceeded12 seconds')),12000);})
    ]).finally(()=>clearTimeout(captureTimer));
    assert.equal(native.size.width,rect.width);assert.equal(native.size.height,rect.height);
    const bytes=Buffer.from(native.png,'base64');assert.equal(bytes.readUInt32BE(16),rect.width);assert.equal(bytes.readUInt32BE(20),rect.height);await fs.writeFile(file,bytes);
    receipt.captures.push({file,sha256:hash(bytes),selector:selector??'full interface',method:'Electron webContents.capturePage with stayHidden:true',rect,geometry,viewport,native:{before:native.before,after:native.after,size:native.size,contentBounds:native.contentBounds},readiness:'Caller verified decoded target artwork or expected fallback; fonts loaded'});
  }
  async function requestClose() {
    await app.evaluate(({app,BrowserWindow}) => (app.isPackaged ? BrowserWindow.getAllWindows() : global.__shipwrightHiddenWindows)[0].close());
    await page.locator('#closeDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#closeKeepEditing').evaluate(element => element === document.activeElement), true);
  }
  async function noOverflow(id) {
    const bounds = await page.evaluate(id => { const dialog = document.getElementById(id); const box = dialog.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, clientWidth: dialog.clientWidth, scrollWidth: dialog.scrollWidth, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, documentWidth: document.documentElement.scrollWidth }; }, id);
    assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= bounds.viewport.width && bounds.bottom <= bounds.viewport.height); assert.ok(bounds.scrollWidth <= bounds.clientWidth); assert.ok(bounds.documentWidth <= bounds.viewport.width); return bounds;
  }
  try {
    for (const oldPreference of ['gentle', 'serious']) {
      const profile = path.join(out, 'profile-' + oldPreference);
      phase('seed legacy ' + oldPreference + ' preference in disposable renderer');
      await launch(profile); await page.locator('#locationDialog').waitFor();
      await page.evaluate(value => localStorage.setItem('shipwright.assistant.expression.v1', value), oldPreference);
      await app.evaluate(({ session }) => session.defaultSession.flushStorageData());
      await shutdown();
      phase('normal fresh-process startup ignores legacy ' + oldPreference + ' appearance preference');
      await launch(profile); await page.locator('#locationDialog').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('shipwright.assistant.expression.v1')), oldPreference);
      const location = await imageState('locationAssistant', 144); assert.ok(location.src.endsWith('/wink-144.png'));
      receipt.checks.push({ oldPreference, preferenceLeftUntouched: true, location });
      if (oldPreference === 'serious') {
        await page.setViewportSize({ width: 1440, height: 960 });
        receipt.checks.push({ locationStandardBounds: await noOverflow('locationDialog') });
        await capture('location-standard-full');
      }
      await page.setViewportSize({ width: 1080, height: 720 });
      receipt.checks.push({ locationMinimumBounds: await noOverflow('locationDialog') });
      await capture('location-wink-144-legacy-' + oldPreference, '#locationDialog');
      if (oldPreference === 'serious') {
        await capture('location-minimum-full'); await page.locator('#locationLater').click();
        phase('native close request always shows selected salute');
        await requestClose(); const first = await imageState('closeAssistant', 160); receipt.checks.push({ close: first, minimumBounds: await noOverflow('closeDialog') });
        await capture('close-selected-salute-160', '#closeDialog'); await capture('close-minimum-full');
        const keep = await page.locator('#closeKeepEditing').boundingBox(), recover = await page.locator('#closeRecover').boundingBox(), all = await page.locator('#closeAll').boundingBox(); assert.ok(keep.y < recover.y && recover.y < all.y);
        await page.locator('#closeKeepEditing').click(); await page.locator('#closeDialog').waitFor({ state: 'hidden' });
        await requestClose(); const second = await imageState('closeAssistant', 160); assert.equal(second.src, first.src);
        await page.keyboard.press('Escape'); await page.locator('#closeDialog').waitFor({ state: 'hidden' });
        await requestClose(); assert.equal((await imageState('closeAssistant', 160)).src, first.src);
        receipt.checks.push('Native close → Keep editing → native close → Escape → native close always uses same selected salute; safe default focus and close choice order preserved');
        await page.setViewportSize({ width: 1440, height: 960 });
        receipt.checks.push({ closeStandardBounds: await noOverflow('closeDialog') });
        await capture('close-standard-full');
        await page.setViewportSize({ width: 560, height: 720 });
        const compact = await imageState('closeAssistant', 110); receipt.checks.push({ compact, boundary: 'Supplementary renderer viewport below supported desktop minimum1080' }); await capture('close-selected-salute-110-responsive', '#closeDialog');
        await page.setViewportSize({ width: 1080, height: 720 }); await imageState('closeAssistant', 160);
        phase('missing fixed artwork leaves text and controls usable');
        await page.evaluate(() => { const image = document.getElementById('closeAssistant'); const picture = image.closest('picture'); for (const source of picture?.querySelectorAll('source') ?? []) source.srcset = 'assets/ui/state-artwork-2026-11-22/missing-close-control.png'; image.src = 'assets/ui/state-artwork-2026-11-22/missing-close-control.png'; });
        await page.waitForFunction(() => !document.getElementById('closeAssistantFallback').hidden);
        assert.equal(await page.locator('#closeAssistant').isVisible(), false); assert.equal(await page.locator('#closeKeepEditing').isEnabled(), true); assert.match(await page.locator('#closeDescription').textContent(), /restore|unsaved/); await capture('close-artwork-missing-fallback', '#closeDialog');
        await page.evaluate(source => { document.getElementById('closeAssistant').src = source; }, first.src);
        await imageState('closeAssistant', 160); await page.waitForFunction(() => document.getElementById('closeAssistantFallback').hidden);
        receipt.checks.push('Restoring the real salute URL after the missing-image control restores the illustration and hides its fallback');
        await page.locator('#closeKeepEditing').click();
        await page.reload(); await page.locator('#locationDialog').waitFor(); await imageState('locationAssistant', 144);
        await page.evaluate(() => { document.getElementById('locationAssistant').src = 'assets/ui/state-artwork-2026-11-22/missing-location-control.png'; });
        await page.waitForFunction(() => !document.getElementById('locationAssistantFallback').hidden);
        assert.equal(await page.locator('#locationAssistant').isVisible(), false); assert.equal(await page.locator('#locationChoose').isEnabled(), true); assert.match(await page.locator('#locationTitle').textContent(), /Oops/); await capture('location-artwork-missing-fallback', '#locationDialog');
        await page.locator('#locationLater').click(); assert.equal(await page.locator('#canvas').isVisible(), true);
        assert.equal(await page.evaluate(() => localStorage.getItem('shipwright.assistant.expression.v1')), oldPreference);
        receipt.checks.push('Actual image src redirected to absent local files only in disposable test DOM: both decorative fallbacks and existing dialog instructions/actions remain usable; legacy preference untouched');
      }
      await shutdown();
    }
    await Promise.all(pending);
    assert.deepEqual(receipt.pageErrors, []);
    receipt.sourceAfter = await Promise.all(watchedFiles.map(async file => ({ file, sha256: hash(await fs.readFile(path.join(root, file))) })));
    for (const before of receipt.sourceBefore) assert.equal(receipt.sourceAfter.find(after => after.file === before.file).sha256, before.sha256, 'Source changed during execution: ' + before.file);
    if(executable){receipt.packageAfter={executable,archive:receipt.packageBefore.archive,exeSha256:hash(await fs.readFile(executable)),archiveSha256:hash(await fs.readFile(receipt.packageBefore.archive))};assert.equal(receipt.packageAfter.exeSha256,receipt.packageBefore.exeSha256);assert.equal(receipt.packageAfter.archiveSha256,receipt.packageBefore.archiveSha256);}
    receipt.passed = true;
  } catch (error) {
    receipt.failure = { message: error.message, stack: error.stack, url: page?.url() }; throw error;
  } finally {
    try { await shutdown(); } catch(error) { receipt.passed=false; receipt.cleanupFailure={message:error.message,stack:error.stack}; throw error; } finally { await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2)); }
  }
  console.log(JSON.stringify({ passed: receipt.passed, out, captures: receipt.captures.length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
