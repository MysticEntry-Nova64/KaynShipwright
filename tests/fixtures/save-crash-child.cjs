// Test-only barriers around the real save implementation. Never use user files.
const fs = require('node:fs/promises');
const { saveFile } = require('../../save-service.cjs');
const [boundary, destination, text] = process.argv.slice(2);
if (!process.send || !['before-write', 'after-partial-write', 'after-write', 'after-rename'].includes(boundary) || !destination || !text) process.exit(64);
process.on('message', () => {}); // Keep IPC referenced while paused.
process.on('disconnect', () => process.exit(0)); // Do not orphan after losing the parent.
async function pause() {
  process.send({ boundary, pid: process.pid });
  await new Promise(() => {});
}
const write = fs.writeFile, rename = fs.rename;
fs.writeFile = async (file, bytes, options) => {
  if (boundary === 'before-write') await pause();
  if (boundary === 'after-partial-write') {
    await write(file, bytes.subarray(0, Math.floor(bytes.length / 2)), options);
    await pause();
  }
  const result = await write(file, bytes, options);
  if (boundary === 'after-write') await pause();
  return result;
};
fs.rename = async (...args) => {
  const result = await rename(...args);
  if (boundary === 'after-rename') await pause();
  return result;
};
saveFile(destination, text).then(
  () => process.exit(65), // Normal completion means the barrier was missed.
  error => { console.error(error); process.exit(66); },
);
