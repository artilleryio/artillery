/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { test, before } = require('tap');
const sinon = require('sinon');

const HttpEngine = require('../../../core/lib/engine_http');
const EventEmitter = require('events');
const { createGlobalObject } = require('../../../lib/artillery-global');
const nock = require('nock');
const zlib = require('zlib');

const THINKTIME_SEC = 1;

const script = {
  config: {
    target: 'http://localhost:8888',
    processor: {
      f: function (context, _ee, next) {
        context.vars.newVar = 1234;
        return next();
      },

      inc: function (context, _ee, next) {
        context.vars.inc = context.vars.$loopCount;
        return next();
      },

      processLoopElement: function (context, _ee, next) {
        context.vars.loopElement = context.vars.$loopElement;
        return next();
      },

      loopChecker: function (context, next) {
        if (context.vars.someCounter === undefined) {
          context.vars.someCounter = 1;
        }

        context.vars.someCounter++;

        let cond = context.vars.someCounter < 3;
        console.log(context.vars.someCounter);
        return next(cond);
      }
    }
  },
  scenarios: [
    {
      name: 'Whatever',
      flow: [
        { think: THINKTIME_SEC },
        { function: 'f' },
        { log: '# This is printed from the script with "log": {{ newVar }}' },
        { loop: [{ function: 'inc' }, { think: 1 }], count: 3 },
        { loop: [{ log: '# {{ $loopElement }}' }], over: [0, 1, 2] },
        { loop: [{ function: 'processLoopElement' }], over: 'aCapturedList' },
        {
          loop: [{ log: '# whileTrue loop' }],
          whileTrue: 'loopChecker',
          count: 10 // whileTrue takes precedence, checked in an assert
        }
      ]
    }
  ]
};

before(async () => await createGlobalObject());

test('HTTP engine interface', function (t) {
  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  t.ok(engine, 'Can construct an engine');
  t.ok(
    typeof runScenario === 'function',
    'Can use the engine to create virtual user functions'
  );
  t.end();
});

test('HTTP virtual user', function (t) {
  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const spy = sinon.spy(console, 'log');
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.once('started', onStarted);

  const initialContext = {
    vars: {
      aCapturedList: ['hello', 'world']
    }
  };

  t.plan(8);

  const startedAt = Date.now();
  runScenario(initialContext, function userDone(err, finalContext) {
    const finishedAt = Date.now();
    t.ok(!err, 'Virtual user finished successfully');
    t.ok(finalContext.vars.newVar === 1234, 'Function spec was executed');
    t.ok(
      finishedAt - startedAt >= THINKTIME_SEC * 1000,
      'User spent some time thinking'
    );

    const expectedLog = '# This is printed from the script with "log": 1234';
    let seen = false;
    spy.args.forEach(function (args) {
      if (args[0] === expectedLog) {
        t.comment(`string: "${args[0]}" found`);
        seen = true;
      }
    });
    t.ok(seen, 'log worked');
    console.log.restore(); // unwrap the spy
    // loop count starts at 0, hence 2 rather than 3 here:
    t.ok(finalContext.vars.inc === 2, 'Function called in a loop');
    t.ok(
      finalContext.vars.loopElement === 'world',
      'loopElement set by custom function'
    );

    // someCounter is set by a whileTrue hook function:
    t.ok(finalContext.vars.someCounter === 3, 'whileTrue aborted the loop');

    t.end();
  });

  function onStarted() {
    t.ok(true, 'started event emitted');
  }
});

test('extendedMetrics', (t) => {
  const histograms = new Set();
  const additionalMetrics = [
    'engine.http.dns',
    'engine.http.tcp',
    'engine.http.tls',
    'engine.http.total'
  ];
  const target = nock('http://localhost:8888').get('/').reply(200, 'ok');

  const script = {
    config: {
      target: 'http://localhost:8888',
      http: { extendedMetrics: true }
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.on('histogram', (name) => {
    histograms.add(name);
  });

  runScenario({ vars: {} }, function userDone(err, context) {
    if (err) {
      t.fail();
    }

    additionalMetrics.forEach((metric) => {
      t.ok(
        histograms.has(metric),
        `it should track additional metric ${metric}`
      );
    });

    t.ok(target.isDone(), 'Should have made a request to /');
    t.end();
  });
});

test('gzip - request headers', (t) => {
  const target = nock('http://localhost:8888')
    .post('/')
    .reply(201, function () {
      t.ok(
        'accept-encoding' in this.req.headers,
        'sets the accept-encoding header if gzip is true'
      );

      return 'ok';
    });

  const script = {
    config: {
      target: 'http://localhost:8888'
    },
    scenarios: [
      {
        flow: [
          {
            post: {
              url: '/',
              json: { foo: 'bar' },
              gzip: true
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  runScenario({ vars: {} }, function userDone(err) {
    if (err) {
      t.fail();
    }

    t.ok(target.isDone(), 'Should have made a request to /');
    t.end();
  });
});

test('gzip - compressed responses', (t) => {
  const target = nock('http://localhost:8888')
    .get('/')
    .reply(201, zlib.gzipSync('ok'), { 'content-encoding': 'gzip' });

  const script = {
    config: {
      target: 'http://localhost:8888'
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/',
              gzip: true
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  runScenario({ vars: {} }, function userDone(err, context) {
    if (err) {
      t.fail();
    }

    t.equal(context._successCount, 1, 'it should handle compressed responses');
    t.ok(target.isDone(), 'Should have made a request to /');
    t.end();
  });
});

test('custom headers', function (t) {
  const customHeader = 'x-artillery-header';
  const customHeaderValue = 'abcde';
  const target = nock('http://localhost:8888')
    .get('/')
    .reply(200, function () {
      t.equal(
        this.req.headers[customHeader],
        customHeaderValue,
        'Can set custom request headers'
      );

      return 'ok';
    });

  const script = {
    config: {
      target: 'http://localhost:8888'
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/',
              headers: { [customHeader]: customHeaderValue }
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  runScenario({ vars: {} }, function userDone(err) {
    if (err) {
      t.fail();
    }

    t.ok(target.isDone(), 'Should have made a request to /');

    t.end();
  });
});

test('url and uri parameters', function (t) {
  const target = nock('http://localhost:8888')
    .get('/hello?hello=world')
    .reply(200, 'ok');

  const script = {
    config: {
      target: 'http://localhost:8888',
      processor: {
        rewriteUrl: function (req, _context, _ee, next) {
          req.uri = '/hello';
          return next();
        },
        printHello: function (_req, _context, _ee, next) {
          console.log('# hello from printHello hook!');
          return next();
        }
      }
    },
    scenarios: [
      {
        // test for https://github.com/shoreditch-ops/artillery/issues/184:
        beforeRequest: 'printHello',
        name: 'Whatever',
        flow: [
          {
            get: {
              uri: '/will/404',
              beforeRequest: 'rewriteUrl',
              qs: {
                hello: 'world'
              }
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const spy = sinon.spy(console, 'log');
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  const initialContext = {
    vars: {}
  };

  runScenario(initialContext, function userDone(err, finalContext) {
    if (err) {
      t.fail();
    }

    t.ok(target.isDone(), 'Should have made a request to /hello');

    const expectedLog = '# hello from printHello hook!';
    let seen = false;
    spy.args.forEach(function (args) {
      if (args[0] === expectedLog) {
        t.comment(`string: "${args[0]}" found`);
        seen = true;
      }
    });
    t.ok(seen, 'scenario-level beforeRequest worked');
    console.log.restore(); // unwrap the spy

    t.end();
  });
});

test('hooks - afterResponse', (t) => {
  const answer = 'the answer is 42';

  nock('http://localhost:8888').get('/answer').reply(200, answer);

  const script = {
    config: {
      target: 'http://localhost:8888',
      processor: {
        extractAnswer: function (req, res, vuContext, events, next) {
          vuContext.answer = res.body;
          return next();
        }
      }
    },
    scenarios: [
      {
        name: 'Get answer',
        flow: [
          {
            get: {
              uri: '/answer',
              afterResponse: 'extractAnswer'
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  const initialContext = {
    vars: {}
  };

  runScenario(initialContext, function userDone(err, finalContext) {
    if (err) {
      t.fail();
    }

    t.ok(finalContext.answer === answer);

    t.end();
  });
});

test('Redirects', (t) => {
  const target = nock('http://localhost:8888')
    .get('/foo')
    .reply(302, undefined, {
      Location: '/bar'
    })
    .get('/bar')
    .reply(200, { foo: 'bar' });

  const script = {
    config: {
      target: 'http://localhost:8888'
    },
    scenarios: [
      {
        flow: [{ get: { url: '/foo' } }]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();

  const counters = {};
  ee.on('counter', (name, val) => {
    if (counters[name]) {
      counters[name] += val;
    } else {
      counters[name] = val;
    }
  });

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  const initialContext = {
    vars: {}
  };

  runScenario(initialContext, function (err, finalContext) {
    if (err) {
      t.fail();
    }

    t.ok(
      Object.keys(counters).filter((s) => s.indexOf('.codes.') > -1).length ===
        2,
      'Should have seen 2 unique response codes'
    );

    t.ok(counters['engine.http.codes.302'] === 1, 'Should have 1 302 response');
    t.ok(counters['engine.http.codes.200'] === 1, 'Should have 1 200 response');

    t.end();
  });
});

test('Forms - formData multipart', (t) => {
  const target = nock('http://localhost:8888')
    // .log(console.log)
    .post(
      '/submit',
      /Content-Disposition: form-data[\s\S]+activity[\s\S]+surfing/gi
    )
    .reply(200, 'ok');

  const script = {
    config: {
      target: 'http://localhost:8888'
    },
    scenarios: [
      {
        flow: [
          {
            post: {
              url: '/submit',
              formData: {
                activity: '{{ activity }}',
                type: '{{ type }}',
                location: '{{ location }}'
              }
            }
          }
        ]
      }
    ]
  };

  const engine = new HttpEngine(script);
  const ee = new EventEmitter();

  const counters = {};
  ee.on('counter', (name, val) => {
    if (counters[name]) {
      counters[name] += val;
    } else {
      counters[name] = val;
    }
  });

  const runScenario = engine.createScenario(script.scenarios[0], ee);

  const initialContext = {
    vars: {
      location: 'Lahinch',
      type: 'beach',
      activity: 'surfing'
    }
  };

  runScenario(initialContext, function (err, finalContext) {
    if (err) {
      t.fail();
    }

    t.ok(counters['engine.http.codes.200'] === 1, 'Should have a 200 response');

    t.end();
  });
});
