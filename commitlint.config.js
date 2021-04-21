const config = require('@commitlint/config-conventional');

const types = config.rules['type-enum'][2].concat(['dep']);
const cases = [
  'lower-case', // default
  'upper-case', // UPPERCASE
  'camel-case', // camelCase
  'kebab-case', // kebab-case
  'pascal-case', // PascalCase
  'sentence-case', // Sentence case
  'snake-case', // snake_case
  'start-case' // Start Case
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', types],
    'subject-case': [2, 'always', cases ]
  }
};
