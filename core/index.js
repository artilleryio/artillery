const { createGlobalObject } = require('../lib/artillery-global');

createGlobalObject();

module.exports = require('./lib/runner');
