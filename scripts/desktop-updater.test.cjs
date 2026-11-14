const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startUpdater, releaseNotesText } = require('../electron/updater.cjs');

test('release feed notes are bounded plain text and never executable HTML', () => {
  assert.deepEqual(releaseNotesText([{ version: '1.1.5', note: '<p>Updated launchers</p>' }]), ['Updated launchers']);
  assert.deepEqual(releaseNotesText(null), []);
  assert.equal(releaseNotesText('x'.repeat(3000))[0].length, 2000);
});

test('unpackaged apps never start updating', () => {
  const updater = new EventEmitter();
  let calls = 0;
  updater.checkForUpdates = () => { calls++; };
  const controller = startUpdater({ app: { isPackaged: false }, updater, hasFeed: true, notify: () => {} });
  assert.equal(controller.getState().status, 'disabled');
  assert.equal(calls, 0);
});
test('signed packaged builds download automatically and install on quit, never downgrade', async () => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const updater = new EventEmitter();
    updater.checkForUpdates = async () => {};
    const states = [];
    const controller = startUpdater({ app: { isPackaged: true, getVersion: () => '1.1.4' }, updater, hasFeed: true, notify: (s) => states.push(s), setIntervalFn: () => 1, clearIntervalFn: () => {} });
    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, true);
    assert.equal(updater.allowDowngrade, false);
    updater.emit('update-available', { version: '1.1.5' });
    assert.equal(controller.getState().status, 'downloading');
    updater.emit('update-downloaded', { version: '1.1.5' });
    assert.equal(controller.getState().status, 'ready');
    assert.equal(controller.getState().version, '1.1.5');
    assert.equal(controller.getState().percent, 100);
    controller.dispose();
    assert.equal(updater.listenerCount('update-downloaded'), 0);
  } finally { Object.defineProperty(process, 'platform', original); }
});