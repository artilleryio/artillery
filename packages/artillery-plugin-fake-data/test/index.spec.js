'use strict';

const { test } = require('tap');
const {
  Plugin,
  getFakerFunctions,
  getDeprecatedAliases
} = require('../index');

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

test('exposes faker functions with flattened names', (t) => {
  const functions = getFakerFunctions();

  t.ok(functions.length > 200, `found ${functions.length} functions`);

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
    t.ok(functions.includes(expected), `includes ${expected}`);
  }

  t.end();
});

test('attaches beforeScenario hook and processor function', (t) => {
  const script = makeScript();
  new Plugin(script, null);

  t.same(script.scenarios[0].beforeScenario, ['fakeDataHandler']);
  t.type(script.config.processor.fakeDataHandler, 'function');
  t.end();
});

test('injects working $functions into context.funcs', (t) => {
  const script = makeScript();
  new Plugin(script, null);

  const { context, nextCalled } = runHandler(script);

  t.ok(nextCalled, 'next() was called');
  t.type(context.funcs.$internetEmail, 'function');

  const email = context.funcs.$internetEmail();
  t.match(email, /@/, `generated email: ${email}`);

  const uuid = context.funcs.$stringUuid();
  t.match(
    uuid,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    `generated uuid: ${uuid}`
  );

  t.end();
});

test('passes plugin config as function options', (t) => {
  const script = makeScript({
    internetPassword: { length: 5 },
    numberInt: { min: 10, max: 10 }
  });
  new Plugin(script, null);

  const { context } = runHandler(script);

  t.equal(context.funcs.$internetPassword().length, 5);
  t.equal(context.funcs.$numberInt(), 10);
  t.end();
});

test('deprecated falso aliases work and warn once', (t) => {
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
      t.type(
        context.funcs[`$${aliasName}`],
        'function',
        `$${aliasName} is exposed`
      );
      t.type(
        context.funcs[`$${funcName}`],
        'function',
        `alias target $${funcName} exists`
      );
      t.ok(
        context.funcs[`$${aliasName}`]() !== undefined,
        `$${aliasName} returns a value`
      );
    }

    const email = context.funcs.$randEmail();
    t.match(email, /@/, `alias generated email: ${email}`);

    const aliasCount = Object.keys(getDeprecatedAliases()).length;
    t.equal(warnings.length, aliasCount, 'warned once per alias');

    // calling again must not warn again
    context.funcs.$randEmail();
    t.equal(warnings.length, aliasCount, 'no duplicate warnings');
  } finally {
    console.warn = originalWarn;
  }

  t.end();
});

test('reads config from config.fake-data as well as config.plugins.fake-data', (t) => {
  const script = {
    config: {
      'fake-data': { internetPassword: { length: 7 } },
      plugins: { 'fake-data': {} }
    },
    scenarios: [{ flow: [] }]
  };
  new Plugin(script, null);

  const { context } = runHandler(script);
  t.equal(context.funcs.$internetPassword().length, 7);
  t.end();
});
