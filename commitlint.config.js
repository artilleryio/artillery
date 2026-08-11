// Types from @commitlint/config-conventional, plus custom 'dep' type.
// Hardcoded: config-conventional v21+ is ESM-only, require() interop
// would need .default unwrapping.
const types = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
  'dep'
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', types]
  }
};
