const { test } = require('tap');
const createDebug = require('debug');
const EventEmitter = require('node:events');

const _debug = createDebug('expect-plugin:test');
const chalk = require('chalk');

const shelljs = require('shelljs');
const path = require('node:path');
const os = require('node:os');
const _fs = require('node:fs');

//
// We only need this when running unit tests. When the plugin actually runs inside
// a recent version of Artillery, the appropriate object is already set up.
//
global.artillery = {
  util: {
    template: require('artillery/util').template
  }
};

test('Basic interface checks', async (t) => {
  const script = {
    config: {},
    scenarios: []
  };

  const ExpectationsPlugin = require('../index');
  const events = new EventEmitter();
  const plugin = new ExpectationsPlugin.Plugin(script, events);

  t.type(ExpectationsPlugin.Plugin, 'function');
  t.type(plugin, 'object');
});

test('Expectation: statusCode', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - value received - user context - expected result
    ['{{ expectedStatus }}', 200, { vars: { expectedStatus: 200 } }, true],
    [200, 200, { vars: {} }, true],
    ['200', 200, { vars: {} }, true],
    [200, '200', { vars: {} }, true],
    ['200', '200', { vars: {} }, true],

    ['{{ expectedStatus }}', 200, { vars: { expectedStatus: 202 } }, false],
    ['{{ expectedStatus }}', '200', { vars: {} }, false],
    [301, '200', { vars: {} }, false]
  ];

  data.forEach((e) => {
    const result = expectations.statusCode(
      { statusCode: e[0] }, // expectation
      {}, // body
      {}, // req
      { statusCode: e[1] }, // res
      e[2] // userContext
    );

    t.equal(result.ok, e[3]);
  });
});

test('Expectation: notStatusCode', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - value received - user context - expected result
    [
      '{{ expectedNotStatusCode }}',
      200,
      { vars: { expectedNotStatusCode: 404 } },
      true
    ],
    [301, 200, { vars: {} }, true],
    ['400', 301, { vars: {} }, true],
    [404, '200', { vars: {} }, true],
    ['401', '200', { vars: {} }, true],
    [[404, 200, 300], 310, { vars: {} }, true],
    [['404', '200', '300'], '310', { vars: {} }, true],
    [['404', '200', '300'], 310, { vars: {} }, true],
    [
      '{{ expectedNotStatusCode }}',
      200,
      { vars: { expectedNotStatusCode: 200 } },
      false
    ],
    [
      '{{ expectedNotStatusCode }}',
      '200',
      { vars: { expectedNotStatusCode: 404 } },
      true
    ],
    [200, '200', { vars: {} }, false],
    ['200', 200, { vars: {} }, false],
    [[404, 202, 310], 404, { vars: {} }, false],
    [['404', '200', '300'], '300', { vars: {} }, false],
    [['404', '200', '310'], 310, { vars: {} }, false]
  ];

  for (const e of data) {
    const result = expectations.notStatusCode(
      { notStatusCode: e[0] }, // expectation
      {}, // body
      {}, // req
      { statusCode: e[1] }, // res
      e[2] // userContext
    );

    t.equal(result.ok, e[3]);
  }
});

test('Expectation: validRegex', async (t) => {
  const expectations = require('../lib/expectations');

  const result = expectations.matchesRegexp(
    {
      matchesRegexp:
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    },
    'ea91af53-a673-4ceb-999b-1ab0d247bd48', // body
    {}, // req
    {}, // res
    '' // userContext
  );

  t.equal(result.ok, true);
});

test('Expectation: hasProperty', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - body received - user context - expected result
    [
      '{{ hasProperty }}',
      { someProperty: 'someValue' },
      { vars: { hasProperty: 'someProperty' } },
      true
    ],
    ['someProperty', { someProperty: 'someValue' }, { vars: {} }, true],
    [
      '{{ hasProperty }}',
      { someOtherProperty: 'someValue' },
      { vars: { hasProperty: 'someProperty' } },
      false
    ],
    ['someProperty', { someOtherProperty: 'someValue' }, { vars: {} }, false],
    [
      '{{ hasProperty }}',
      null,
      { vars: { hasProperty: 'someProperty' } },
      false
    ],
    ['someProperty', null, { vars: {} }, false]
  ];

  data.forEach((e) => {
    const result = expectations.hasProperty(
      { hasProperty: e[0] },
      e[1], // body
      {}, // req
      { statusCode: 200 }, // res
      e[2]
    ); // userContext

    t.equal(result.ok, e[3]);
  });
});

test('Expectation: notHasProperty', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - body received - user context - expected result
    [
      '{{ notHasProperty }}',
      { someOtherProperty: 'someValue' },
      { vars: { notHasProperty: 'someProperty' } },
      true
    ],
    ['someProperty', { someOtherProperty: 'someValue' }, { vars: {} }, true],
    [
      '{{ notHasProperty }}',
      { someProperty: 'someValue' },
      { vars: { notHasProperty: 'someProperty' } },
      false
    ],
    ['someProperty', { someProperty: 'someValue' }, { vars: {} }, false],
    [
      '{{ notHasProperty }}',
      null,
      { vars: { notHasProperty: 'someProperty' } },
      false
    ],
    ['someProperty', null, { vars: {} }, false]
  ];

  data.forEach((e) => {
    const result = expectations.notHasProperty(
      { notHasProperty: e[0] },
      e[1], // body
      {}, // req
      { statusCode: 200 }, // res
      e[2]
    ); // userContext

    t.equal(result.ok, e[3]);
  });
});

test('Expectation: contentType', async (t) => {
  const expectations = require('../lib/expectations');

  const data = [
    // expectation - body received - res.headers.content-type - user context - expected result
    [
      '{{ expectedContentType }}',
      {},
      'application/json',
      { expectedContentType: 'json' },
      true
    ],
    ['json', {}, 'application/json; charset=utf-8', {}, true],
    ['json', {}, 'charset=utf-8; application/json', {}, true],
    ['json', {}, 'application/problem+json; charset=utf-8', {}, true],
    ['json', {}, 'charset=utf-8; application/problem+json', {}, true],

    ['text/plain', 'string', 'text/plain', {}, true],
    ['TEXT/PLAIN', 'string', 'text/plain', {}, true],
    ['text/plain', 'string', 'TEXT/PLAIN', {}, true],
    ['text/plain', {}, 'text/plain', {}, true],

    ['text/plain', 'string', 'application/json', {}, false],
    ['json', null, 'application/json', {}, false],
    ['json', 'string', 'application/json', {}, false]
  ];

  data.forEach((e) => {
    const result = expectations.contentType(
      { contentType: e[0] }, // expectation
      e[1], // body
      {}, // req
      { headers: { 'content-type': e[2] } }, // res
      { vars: e[3] } // userContext
    );

    t.equal(result.ok, e[4]);
  });
});

test('Expectation: headerEquals', async (t) => {
  const expectations = require('../lib/expectations');

  // expectation - response object - user context - expected result
  const data = [
    [
      [
        'set-cookie',
        [
          'cookie1-name={{ cookie1value }};Path=/',
          'cookie2-name={{ cookie2value }};Path=/'
        ]
      ],
      {
        headers: {
          'set-cookie': [
            'cookie1-name=value1;Path=/',
            'cookie2-name=value2;Path=/'
          ]
        }
      },
      {
        vars: {
          cookie1value: 'value1',
          cookie2value: 'value2'
        }
      },
      true
    ],
    [
      ['content-encoding', 'deflate, gzip'],
      {
        headers: {
          'content-enconding': 'gzip'
        }
      },
      {
        vars: {}
      },
      false
    ],
    [
      ['x-request-id', '{{ reqId }}'],
      {
        headers: {
          'x-request-id': 'abcdef'
        }
      },
      {
        vars: {
          reqId: 'abcdef'
        }
      },
      true
    ]
  ];

  data.forEach((e) => {
    const result = expectations.headerEquals(
      { headerEquals: e[0] },
      {}, // body
      {}, // req
      e[1], // res
      e[2]
    ); // userContext
    t.equal(result.ok, e[3]);
  });
});

test('Integration with Artillery', async (t) => {
  shelljs.env.ARTILLERY_PLUGIN_PATH = path.resolve(__dirname, '..', '..');
  shelljs.env.PATH = process.env.PATH;
  const result = shelljs.exec(
    `${__dirname}/../../../node_modules/.bin/artillery run --solo -q ${__dirname}/pets-test.yaml`,
    {
      silent: false
    }
  );

  const output = result.stdout;

  const EXPECTED_EXPECTATION_COUNT = 16;
  const actualCount = output.split('\n').filter((s) => {
    return (
      s.trim().startsWith(chalk.green('ok')) ||
      s.trim().startsWith(chalk.red('not ok'))
    );
  }).length;

  if (EXPECTED_EXPECTATION_COUNT !== actualCount) {
    console.log('Artillery output:');
    console.log(output);
  }
  t.equal(
    actualCount,
    EXPECTED_EXPECTATION_COUNT,
    'Expectation count should match'
  );

  t.equal(
    output.indexOf(`${chalk.green('ok')} contentType json`) > -1,
    true,
    'Should print ok contentType expectation'
  );
  t.equal(
    output.indexOf(`${chalk.green('ok')} statusCode 404`) > -1,
    true,
    'Should print ok statusCode expectation'
  );
  t.equal(output.indexOf('Errors:') === -1, true, 'Should not print errors');
  t.equal(result.code, 0, 'Should exit with code 0');
});

test('Produce metrics', async (t) => {
  shelljs.env.ARTILLERY_PLUGIN_PATH = path.resolve(__dirname, '..', '..');
  shelljs.env.PATH = process.env.PATH;
  const result = shelljs.exec(
    `${__dirname}/../../../node_modules/.bin/artillery run --solo ${__dirname}/pets-test.yaml`,
    {
      silent: false
    }
  );

  const output = result.stdout;

  t.equal(
    output.indexOf('expect.ok') > -1,
    true,
    'Should print expect.ok metrics'
  );
  t.equal(result.code, 0, 'Should exit with code 0');
});

test('Report failures as errors by request name', async (t) => {
  shelljs.env.ARTILLERY_PLUGIN_PATH = path.resolve(__dirname, '..', '..');
  shelljs.env.PATH = process.env.PATH;
  const result = shelljs.exec(
    `${__dirname}/../../../node_modules/.bin/artillery run --solo ${__dirname}/pets-fail-test.yaml`,
    {
      silent: false
    }
  );

  const output = result.stdout;

  t.ok(
    output.indexOf('errors.Failed expectations for request unicorns') > -1,
    'Should print errors for request unicorns'
  );
  t.not(result.code, 0, 'Should exit with non-zero code');
});

test("Works as expected with 'parallel'", async (t) => {
  const expectedVus = 4;
  const expectedVusFailed = 0;
  const shouldFail = 4;
  const shouldPass = 8;
  shelljs.env.ARTILLERY_PLUGIN_PATH = path.resolve(__dirname, '..', '..');
  shelljs.env.PATH = process.env.PATH;

  const reportPath = `${os.tmpdir()}/artillery-plugin-expect-parallel-test.json`;

  const result = shelljs.exec(
    `${__dirname}/../../../node_modules/.bin/artillery run ${__dirname}/parallel.yml -o ${reportPath}`,
    {
      silent: false
    }
  );

  const output = result.stdout;

  const report = require(reportPath);
  console.log(report.aggregate.counters);

  t.equal(
    output.indexOf('expect.ok') > -1,
    true,
    'Should print expect.ok metrics'
  );
  t.ok(result.code !== 0, 'Should exit with non zero code');
  t.equal(
    report.aggregate.counters['vusers.created'],
    expectedVus,
    `${expectedVus} VUs should have been created`
  );
  t.equal(
    report.aggregate.counters['vusers.failed'],
    expectedVusFailed,
    `${expectedVusFailed} VUs should have failed`
  );
  t.equal(
    report.aggregate.counters['plugins.expect.ok'],
    shouldPass,
    `${shouldPass} expectations should have passed`
  );
  t.equal(
    report.aggregate.counters['plugins.expect.failed'],
    shouldFail,
    `${shouldFail} expectations should have failed`
  );
});
