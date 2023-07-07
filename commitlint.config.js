const config = require('@commitlint/config-conventional');

const types = config.rules['type-enum'][2].concat(['dep']);

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', types]
  }
};
