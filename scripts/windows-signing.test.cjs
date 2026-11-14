const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const config = yaml.load(fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8'));
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/desktop-windows.yml'), 'utf8'));

test('Windows signatures use SHA-256', () => {
  assert.deepEqual(config.win.signtoolOptions.signingHashAlgorithms, ['sha256']);
});

test('Windows signing derives the publisher from the certificate', () => {
  assert.equal(Object.hasOwn(config.win.signtoolOptions, 'publisherName'), false);
  assert.equal(Object.hasOwn(config.win, 'publisherName'), false);
});

test('Signed Windows release requires signing rather than silently producing unsigned output', () => {
  const build = workflow.jobs.windows.steps.find(step => step.name === 'Build signed installer and portable app');
  assert.ok(build);
  assert.ok(build.run.includes('--config.win.forceCodeSigning=true'));
});

test('Windows builds produce both an x64 installer and portable application', () => {
  assert.deepEqual(config.win.target, [
    { target: 'nsis', arch: ['x64'] },
    { target: 'portable', arch: ['x64'] },
  ]);
});