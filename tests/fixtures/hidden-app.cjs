// Test-only bootstrap: load the actual production main/preload/renderer without
// showing a window or allowing its focus/restore routes to take the desktop.
const electron = require('electron');
const path = require('node:path');
const Module = require('node:module');
const NativeWindow = electron.BrowserWindow;
global.__shipwrightHiddenWindows = [];
class HiddenWindow extends NativeWindow {
  constructor(options) { super({ ...options, show: false }); global.__shipwrightHiddenWindows.push(this); }
  show() {}
  focus() {}
  restore() {}
}
// Electron's module has non-configurable exports. Substitute the constructor
// only for main.cjs's require, leaving the native module and its cache intact.
const main = path.resolve(__dirname, '../../main.cjs');
electron.app.setAppPath(path.dirname(main));
const originalLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'electron' && parent?.filename === main) return { ...electron, BrowserWindow: HiddenWindow };
  return originalLoad.call(this, request, parent, ...rest);
};
try { require(main); } finally { Module._load = originalLoad; }
