const { createGlobalObject } = require('../lib/artillery-global');

async function main() {
  await createGlobalObject();
}

main();

module.exports = require('./lib/runner');
