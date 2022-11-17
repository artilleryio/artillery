// const { createGlobalObject } = require('../lib/artillery-global');

// async function main() {
//   await createGlobalObject();
// }

// main();

module.exports = {
  runner: require('./lib/runner'),
  engine_util: require('./lib/engine_util'),
  engine_http: require('./lib/engine_http'),
  ssms: require('./lib/ssms'),
  isIdlePhase: require('./lib/is-idle-phase')
};
