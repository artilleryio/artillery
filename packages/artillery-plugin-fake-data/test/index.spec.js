'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
let Plugin, getFakerFunctions, getDeprecatedAliases;

const __tap = require('node:test');
// Module under test is an ES module - load before tests run
__tap.before(async () => {
  ({ Plugin, getFakerFunctions, getDeprecatedAliases } = await import(
    '../index.ts'
  ));
});

const makeScript = (pluginConfig = {}) => ({
  config: {
    plugins: {
      'fake-data': pluginConfig
    }
  },
  scenarios: [{ name: 'test scenario', flow: [] }]
});

const runHandler = (script) => {
  const context = { funcs: {}, vars: {} };
  let nextCalled = false;
  script.config.processor.fakeDataHandler(context, null, () => {
    nextCalled = true;
  });
  return { context, nextCalled };
};

test('exposes faker functions with flattened names', (t, done) => {
  const functions = getFakerFunctions();

  assert.ok(functions.length > 200, `found ${functions.length} functions`);

  for (const expected of [
    'internetEmail',
    'internetPassword',
    'personFullName',
    'personFirstName',
    'stringUuid',
    'numberInt',
    'datatypeBoolean',
    'locationCity',
    'companyName',
    'loremSentence',
    'dateBirthdate', // inherited via prototype chain (SimpleDateModule)
    'datePast'
  ]) {
    assert.ok(functions.includes(expected), `includes ${expected}`);
  }

  done();
});

test('attaches beforeScenario hook and processor function', (t, done) => {
  const script = makeScript();
  new Plugin(script, null);

  assert.deepEqual(script.scenarios[0].beforeScenario, ['fakeDataHandler']);
  assert.strictEqual(typeof script.config.processor.fakeDataHandler, 'function');
  done();
});

test('injects working $functions into context.funcs', (t, done) => {
  const script = makeScript();
  new Plugin(script, null);

  const { context, nextCalled } = runHandler(script);

  assert.ok(nextCalled, 'next() was called');
  assert.strictEqual(typeof context.funcs.$internetEmail, 'function');

  const email = context.funcs.$internetEmail();
  assert.match(email, /@/, `generated email: ${email}`);

  const uuid = context.funcs.$stringUuid();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, `generated uuid: ${uuid}`);

  done();
});

test('passes plugin config as function options', (t, done) => {
  const script = makeScript({
    internetPassword: { length: 5 },
    numberInt: { min: 10, max: 10 }
  });
  new Plugin(script, null);

  const { context } = runHandler(script);

  assert.strictEqual(context.funcs.$internetPassword().length, 5);
  assert.strictEqual(context.funcs.$numberInt(), 10);
  done();
});

test('deprecated falso aliases work and warn once', (t, done) => {
  const script = makeScript();
  new Plugin(script, null);

  const { context } = runHandler(script);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (msg) => warnings.push(msg);

  try {
    for (const [aliasName, funcName] of Object.entries(
      getDeprecatedAliases()
    )) {
      assert.strictEqual(typeof context.funcs[`$${aliasName}`], 'function', `$${aliasName} is exposed`);
      assert.strictEqual(typeof context.funcs[`$${funcName}`], 'function', `alias target $${funcName} exists`);
      assert.ok(context.funcs[`$${aliasName}`]() !== undefined, `$${aliasName} returns a value`);
    }

    const email = context.funcs.$randEmail();
    assert.match(email, /@/, `alias generated email: ${email}`);

    const aliasCount = Object.keys(getDeprecatedAliases()).length;
    assert.strictEqual(warnings.length, aliasCount, 'warned once per alias');

    // calling again must not warn again
    context.funcs.$randEmail();
    assert.strictEqual(warnings.length, aliasCount, 'no duplicate warnings');
  } finally {
    console.warn = originalWarn;
  }

  done();
});

test('reads config from config.fake-data as well as config.plugins.fake-data', (t, done) => {
  const script = {
    config: {
      'fake-data': { internetPassword: { length: 7 } },
      plugins: { 'fake-data': {} }
    },
    scenarios: [{ flow: [] }]
  };
  new Plugin(script, null);

  const { context } = runHandler(script);
  assert.strictEqual(context.funcs.$internetPassword().length, 7);
  done();
});
