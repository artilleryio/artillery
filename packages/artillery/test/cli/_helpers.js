const sh = require('execa');
const temp = require('temp').track();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getBinPathSync } = require('get-bin-path');
const a9path = getBinPathSync();

async function execute(args, options) {
  try {
    const fn = temp.path({ suffix: '.txt' });
    const c = sh(a9path, args, options);
    c.stdout.pipe(fs.createWriteStream(fn));
    const result = await c;
    return [0, result];
  } catch (err) {
    return [err.code, err];
  }
}
async function deleteFile(path) {
  fs.unlinkSync(path);
  return true;
}

function returnTmpPath(fileName) {
  return path.resolve(`${os.tmpdir()}/${fileName}`);
}

async function getRootPath(filename) {
  return path.resolve(__dirname, '..', '..', filename);
}

function getTestTags(additionalTags) {
  const actorTag = `actor:${process.env.GITHUB_ACTOR || 'localhost'}`;
  const repoTag = `repo:${process.env.GITHUB_REPO || 'artilleryio/artillery'}`;
  const ciTag = `ci:${process.env.GITHUB_ACTIONS ? 'true' : 'false'}`;

  return `${repoTag},${actorTag},${ciTag},${additionalTags.join(',')}`;
}

module.exports = {
  execute,
  deleteFile,
  getRootPath,
  returnTmpPath,
  getTestTags
};
