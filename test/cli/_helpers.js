const sh = require('execa');
const temp = require('temp').track();
const fs = require('fs');
const { getBinPathSync } = require('get-bin-path');
const a9path = getBinPathSync();

async function a9(args) {
  const fn = temp.path({ suffix: '.txt' });
  const c = sh(a9path, args);
  c.stdout.pipe(fs.createWriteStream(fn));
  const result = await c;
  return result;
}

module.exports = { a9 };
