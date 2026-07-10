const { test } = require('tap');
let contextFuncs;

const __tap = require('tap');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  ({ contextFuncs } = await import('../../lib/runner.ts'));
});

test('$randomString should return a string of the specified length', async (t) => {
  const testStringOfLength = (length) => {
    const defaultStringLength = 10;
    const errors = [];
    for (let i = 0; i < 10000; i++) {
      const string = contextFuncs.$randomString(length);
      if (string.length !== (length || defaultStringLength)) {
        errors.push(string);
      }
    }

    t.ok(
      errors.length === 0,
      `All strings should be of length ${length || defaultStringLength}. Got ${
        errors.length
      } bad strings: ${JSON.stringify(errors)}`
    );
  };

  //test with different size strings
  testStringOfLength();
  testStringOfLength(1);
  testStringOfLength(2);
  testStringOfLength(10);
  testStringOfLength(100);
  testStringOfLength(1000);
});
