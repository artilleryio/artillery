/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { test } = require('tap');
const sinon = require('sinon');

const HttpEngine = require('../../lib/engine_http');
const EventEmitter = require('events');
const { updateGlobalObject } = require('../../index');
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

test('HTTP engine', function (tap) {
  tap.before(async () => await updateGlobalObject());

  tap.beforeEach(() => nock.cleanAll());

  tap.test('HTTP engine interface', function (t) {
    const engine = new HttpEngine(script);
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    t.ok(engine, 'Can construct an engine');
    t.type(
      runScenario,
      'function',
      'Should be able to use the engine to create virtual user functions'
    );
    t.end();
  });

  tap.test('HTTP virtual user', function (t) {
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
      t.ok(!err, 'Virtual user should finish successfully');
      t.equal(
        finalContext.vars.newVar,
        1234,
        'Function spec should execute and set variable'
      );
      t.ok(
        finishedAt - startedAt >= THINKTIME_SEC * 1000,
        'User should have spent some time thinking'
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
      t.equal(
        finalContext.vars.inc,
        2,
        'Function should have been called in a loop'
      );
      t.equal(
        finalContext.vars.loopElement,
        'world',
        'loopElement should be set by custom function'
      );

      // someCounter is set by a whileTrue hook function:
      t.equal(
        finalContext.vars.someCounter,
        3,
        'whileTrue should have aborted the loop'
      );

      t.end();
    });

    function onStarted() {
      t.ok(true, 'started event emitted');
    }
  });

  tap.test('extendedMetrics', (t) => {
    const histograms = new Set();
    const additionalMetrics = [
      'http.dns',
      'http.tcp',
      'http.tls',
      'http.total'
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

    runScenario({ vars: {} }, function userDone(err) {
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

  tap.test('gzip - compressed responses', (t) => {
    const responseStatus = 'ok';
    const target = nock('http://localhost:8888')
      .get('/')
      .reply(function () {
        t.ok(
          'accept-encoding' in this.req.headers,
          'sets the accept-encoding header if gzip is true'
        );

        return [
          201,
          zlib.gzipSync(
            JSON.stringify({
              status: responseStatus
            })
          ),
          {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
          }
        ];
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
                capture: [{ json: '$.status', as: 'status', strict: false }],
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

      t.equal(
        context.vars.status,
        responseStatus,
        'it should decompress the response'
      );
      t.ok(target.isDone(), 'Should have made a request to /');
      t.end();
    });
  });

  tap.test('custom headers', function (t) {
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

  tap.test('custom cookie js', function (t) {
    const target = nock('http://localhost:8888')
      .get('/')
      .reply(200, function () {
        t.equal(
          this.req.headers.cookie,
          'something=1234',
          'Cookie not found. Should be set in processor logic'
        );

        return 'ok';
      });

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          setCookie: function (requestParams, context, ee, next) {
            requestParams.cookie = { something: '1234' };
            return next();
          }
        }
      },
      scenarios: [
        {
          flow: [
            {
              get: {
                url: '/',
                beforeRequest: 'setCookie'
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

  tap.test('custom cookie js in loop', function (t) {
    const target = nock('http://localhost:8888')
      .get('/')
      .reply(200, function () {
        t.equal(
          this.req.headers.cookie,
          'something=1234',
          'Cookie not set when url is fed from a loop. Make sure to compute url before setting cookies'
        );

        return 'ok';
      });

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          setCookie: function (requestParams, context, ee, next) {
            requestParams.cookie = { something: '1234' };
            return next();
          }
        }
      },
      scenarios: [
        {
          flow: [
            {
              loop: [
                {
                  get: {
                    url: '{{ $loopElement }}',
                    beforeRequest: 'setCookie'
                  }
                }
              ],
              over: ['/']
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

  tap.test('url and uri parameters', function (t) {
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

    runScenario(initialContext, function userDone(err) {
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

  tap.test('Query string', function (t) {
    let endpoint = '';

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          checkArrayValueQuery: function (_req, res, vuContext, _events, next) {
            t.equal(
              _req.searchParams.toString(),
              'hello=world&ids=1&ids=2&ids=3',
              'Array value properly formated into query string'
            );
            return next();
          },
          checkTemplateValueQuery: function (
            _req,
            res,
            vuContext,
            _events,
            next
          ) {
            t.equal(
              _req.searchParams.toString(),
              'hello=world&ids=1&ids=2&ids=3&name=Nalini',
              'Query string properly formatted'
            );
            return next();
          },
          getName: function (req, context, ee, next) {
            context.vars.name = 'Nalini';
            return next();
          }
        }
      },
      scenarios: [
        {
          // test for https://github.com/artilleryio/artillery/issues/2034
          name: 'qs',
          flow: [
            {
              get: {
                uri: '/blah',
                qs: {
                  hello: 'world',
                  ids: [1, 2, 3]
                },
                afterResponse: 'checkArrayValueQuery'
              }
            },
            {
              get: {
                beforeRequest: 'getName',
                uri: '/blah',
                qs: {
                  hello: 'world',
                  ids: [1, 2, 3],
                  name: '{{ name }}'
                },
                afterResponse: 'checkTemplateValueQuery'
              }
            }
          ]
        }
      ]
    };
    const target = nock(script.config.target)
      .get('/blah?hello=world&ids=1&ids=2&ids=3')
      .reply(200, 'ok')
      .get('/blah?hello=world&ids=1&ids=2&ids=3&name=Nalini')
      .reply(200, 'ok');

    const engine = new HttpEngine(script);
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {}
    };

    runScenario(initialContext, function userDone(err) {
      if (err) {
        t.fail();
      }

      t.ok(target.isDone(), 'Should have made a request to /blah');
      t.end();
    });
  });

  tap.test('hooks - afterResponse', (t) => {
    const answer = 'the answer is 42';

    nock('http://localhost:8888').get('/answer').reply(200, answer);

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          extractAnswer: function (_req, res, vuContext, _events, next) {
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

      t.equal(
        finalContext.answer,
        answer,
        'afterResponse hook should run and extract answer'
      );

      t.end();
    });
  });

  tap.test('hooks - beforeScenario', (t) => {
    const endpoint = '/products';
    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          setEndpoint: function (context, ee, next) {
            t.equal(
              context.scenario.name,
              'beforeScenarioTest',
              'beforeScenario hook should have scenario info'
            );
            t.same(context.vars, {}, 'it should receive the context object');
            t.ok(
              ee instanceof EventEmitter,
              'processor function should receive an event emitter'
            );
            t.type(next, 'function', 'it should receive a callback function');

            context.vars.endpoint = endpoint;

            return next();
          }
        }
      },
      scenarios: [
        {
          beforeScenario: 'setEndpoint',
          name: 'beforeScenarioTest',
          flow: [
            {
              get: {
                uri: '{{ endpoint }}'
              }
            }
          ]
        }
      ]
    };

    const target = nock(script.config.target).get(endpoint).reply(200, 'ok');

    const engine = new HttpEngine(script);
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {},
      scenario: script.scenarios[0]
    };

    runScenario(initialContext, function userDone(err, finalContext) {
      if (err) {
        t.fail();
      }

      t.equal(
        finalContext.vars.endpoint,
        endpoint,
        'it should set context vars before running the scenario'
      );

      t.ok(target.isDone(), `Should have made a request to ${endpoint}`);

      t.end();
    });
  });

  tap.test('hooks - afterScenario', (t) => {
    const endpoint = '/products';
    const productsCount = 123;
    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          checkProductsCount: function (context, _ee, next) {
            t.equal(
              context.scenario.name,
              'afterScenarioTest',
              'afterScenario hook should have scenario info'
            );
            t.equal(
              context.vars.count,
              productsCount,
              'it can access variables set by the scenario'
            );

            return next();
          }
        }
      },
      scenarios: [
        {
          afterScenario: 'checkProductsCount',
          name: 'afterScenarioTest',
          flow: [
            {
              get: {
                uri: endpoint,
                capture: [{ json: '$.count', as: 'count' }]
              }
            }
          ]
        },
        {
          flow: [
            {
              get: {
                uri: endpoint,
                capture: [{ json: '$.date', as: 'date' }]
              }
            }
          ]
        }
      ]
    };

    const target = nock(script.config.target)
      .get(endpoint)
      .reply(
        200,
        { count: productsCount, date: new Date().toISOString() },
        { 'content-type': 'application/json' }
      );

    const engine = new HttpEngine(script);
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {},
      scenario: script.scenarios[0]
    };

    runScenario(initialContext, function userDone(err) {
      if (err) {
        t.fail();
      }

      t.ok(target.isDone(), `Should have made a request to ${endpoint}`);

      t.end();
    });
  });

  tap.test('Redirects', (t) => {
    const script = {
      config: {
        target: 'http://localhost:8888'
      },
      scenarios: [
        {
          flow: [
            {
              get: {
                url: '/foo',
                capture: {
                  json: '$',
                  as: 'jsonBody'
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

    const target = nock(script.config.target)
      .get('/foo')
      .reply(302, undefined, {
        Location: '/bar'
      })
      .get('/bar')
      .reply(200, { foo: 'bar' });

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

    runScenario(initialContext, function (err) {
      if (err) {
        t.fail();
      }

      t.ok(target.isDone(), 'Should have made a request to both endpoints');

      t.equal(
        Object.keys(counters).filter((s) => s.indexOf('.codes.') > -1).length,
        2,
        'Should have seen 2 unique response codes'
      );

      t.equal(counters['http.codes.302'], 1, 'Should have 1 302 response');
      t.equal(counters['http.codes.200'], 1, 'Should have 1 200 response');

      t.end();
    });
  });

  test('proxies', function (t) {
    t.plan(4);
    const script = {
      config: {
        target: 'http://localhost:8888'
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
    t.ok(
      engine._httpAgent.proxy === undefined,
      'by default nothing is proxied (http)'
    );
    t.ok(
      engine._httpsAgent.proxy === undefined,
      'by default nothing is proxied (https)'
    );

    const httpProxy = 'http://proxy.url';
    const httpsProxy = 'https://proxy.url';

    t.test('HTTP_PROXY', (t) => {
      const httpProxy = 'http://proxy.url';

      process.env.HTTP_PROXY = httpProxy;
      const engine = new HttpEngine(script);

      t.equal(
        engine._httpAgent.proxy.origin,
        httpProxy,
        'it should get the HTTP proxy url from the HTTP_PROXY environment variable'
      );

      t.equal(
        engine._httpsAgent.proxy.origin,
        httpProxy,
        'it should get the HTTPS proxy url from HTTP_PROXY environment variable'
      );

      t.end();
    });

    t.test('HTTP_PROXY and HTTPS_PROXY', (t) => {
      process.env.HTTP_PROXY = httpProxy;
      process.env.HTTPS_PROXY = httpsProxy;
      const engine = new HttpEngine(script);

      t.equal(
        engine._httpAgent.proxy.origin,
        httpProxy,
        'it should get the HTTP proxy url from the HTTP_PROXY environment variable'
      );

      t.equal(
        engine._httpsAgent.proxy.origin,
        httpsProxy,
        'it should get the HTTPS proxy url from HTTPS_PROXY environment variable'
      );

      t.end();
    });

    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
  });

  tap.test('followRedirect', function (t) {
    const target = nock('http://localhost:8888')
      .get('/')
      .reply(302, undefined, {
        Location: '/do-not-follow'
      })
      .get('/do-not-follow')
      .reply(200, 'ok');

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
                followRedirect: false
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
      counters[name] = (counters[name] || 0) + val;
    });

    const runScenario = engine.createScenario(script.scenarios[0], ee);

    runScenario({ vars: {} }, function userDone(err) {
      if (err) {
        t.fail();
      }

      t.equal(counters['http.codes.302'], 1);
      t.equal(
        counters['http.codes.200'],
        undefined,
        'it should not follow redirects if followRedirect is false (1)'
      );
      t.ok(
        target.pendingMocks().length === 1 &&
          target.pendingMocks()[0].endsWith('/do-not-follow'),
        'it should not follow redirects if followRedirect is false (2)'
      );

      t.end();
    });
  });

  tap.test('Forms - urlencoded', (t) => {
    const initialContext = {
      vars: {
        location: 'Lahinch',
        type: 'beach',
        activity: 'surfing'
      }
    };

    const target = nock('http://localhost:8888')
      .post(
        '/submit',
        `activity=${initialContext.vars.activity}&type=${initialContext.vars.type}&location=${initialContext.vars.location}`
      )
      .reply(200, function () {
        t.equal(
          this.req.headers['content-type'],
          'application/x-www-form-urlencoded',
          'should send an url-encoded form'
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
                url: '/submit',
                form: {
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
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    runScenario(initialContext, function (err) {
      if (err) {
        t.fail();
      }

      t.ok(target.isDone(), 'Should have made a request to /submit');

      t.end();
    });
  });

  tap.test('Forms - formData multipart', (t) => {
    nock('http://localhost:8888')
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

    runScenario(initialContext, function (err) {
      if (err) {
        t.fail();
      }

      t.equal(counters['http.codes.200'], 1, 'Should have one 200 response');

      t.end();
    });
  });

  tap.end();
});
