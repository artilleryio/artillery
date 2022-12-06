const sh = require('execa');
const temp = require('temp').track();
const fs = require('fs');
const path = require('path');
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
    return [err.code, err.stderr];
  }
}
async function deleteFile(path) {
  fs.unlinkSync(path);
  return true;
}

async function getRootPath(filename) {
  return path.resolve(__dirname, '..', '..', filename);
}

module.exports = { execute, deleteFile, getRootPath };
