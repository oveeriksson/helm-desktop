const fs = require('node:fs');
const [owner, repo, extra] = (process.env.GITHUB_REPOSITORY || '').split('/');
if (!owner || !repo || extra || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error('A verified GitHub repository is required.');
const version = require('../package.json').version;
if (process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error('Release tag must match package.json version.');
fs.writeFileSync('desktop-release-config.json', JSON.stringify({
  extends: './electron-builder.yml',
  publish: [{ provider: 'github', owner, repo, releaseType: 'release', private: false }],
}));