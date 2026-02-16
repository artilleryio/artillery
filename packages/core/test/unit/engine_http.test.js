/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('tap');
const sinon = require('sinon');

const HttpEngine = require('../../lib/engine_http');
const EventEmitter = require('node:events');
const { updateGlobalObject } = require('../../index');
const nock = require('nock');
const zlib = require('node:zlib');

const THINKTIME_SEC = 1;

const script = {
  config: {
    target: 'http://localhost:8888',
    processor: {
      f: (context, _ee, next) => {
        context.vars.newVar = 1234;
        return next();
      },

      inc: (context, _ee, next) => {
        context.vars.inc = context.vars.$loopCount;
        return next();
      },

      processLoopElement: (context, _ee, next) => {
        context.vars.loopElement = context.vars.$loopElement;
        return next();
      },

      loopChecker: (context, next) => {
        if (context.vars.someCounter === undefined) {
          context.vars.someCounter = 1;
        }

        context.vars.someCounter++;

        const cond = context.vars.someCounter < 3;
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

test('HTTP engine', (tap) => {
  tap.before(async () => await updateGlobalObject());

  tap.beforeEach(() => nock.cleanAll());

  tap.test('HTTP engine interface', async (t) => {
    const engine = new HttpEngine(script);
    await engine.init();
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

  tap.test('HTTP virtual user', async (t) => {
    const engine = new HttpEngine(script);
    await engine.init();
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
    await new Promise((resolve) => {
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

        const expectedLog =
          '# This is printed from the script with "log": 1234';
        let seen = false;
        spy.args.forEach((args) => {
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
        resolve();
      });
    });

    function onStarted() {
      t.ok(true, 'started event emitted');
    }
  });

  tap.test('extendedMetrics', async (t) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    ee.on('histogram', (name) => {
      histograms.add(name);
    });

    await new Promise((resolve) => {
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
        resolve();
      });
    });
  });

  tap.test('gzip - compressed responses', async (t) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
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
        resolve();
      });
    });
  });

  tap.test('custom headers', async (t) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), 'Should have made a request to /');

        t.end();
        resolve();
      });
    });
  });

  tap.test('custom cookie js', async (t) => {
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
          setCookie: (requestParams, _context, _ee, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), 'Should have made a request to /');

        t.end();
        resolve();
      });
    });
  });

  tap.test('custom cookie js in loop', async (t) => {
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
          setCookie: (requestParams, _context, _ee, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), 'Should have made a request to /');

        t.end();
        resolve();
      });
    });
  });

  tap.test('url and uri parameters', async (t) => {
    const target = nock('http://localhost:8888')
      .get('/hello?hello=world')
      .reply(200, 'ok');

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          rewriteUrl: (req, _context, _ee, next) => {
            req.uri = '/hello';
            return next();
          },
          printHello: (_req, _context, _ee, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const spy = sinon.spy(console, 'log');
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {}
    };

    await new Promise((resolve) => {
      runScenario(initialContext, function userDone(err) {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), 'Should have made a request to /hello');

        const expectedLog = '# hello from printHello hook!';
        let seen = false;
        spy.args.forEach((args) => {
          if (args[0] === expectedLog) {
            t.comment(`string: "${args[0]}" found`);
            seen = true;
          }
        });
        t.ok(seen, 'scenario-level beforeRequest worked');
        console.log.restore(); // unwrap the spy

        t.end();
        resolve();
      });
    });
  });

  tap.test('Query string', async (t) => {
    const _endpoint = '';

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          checkArrayValueQuery: (_req, _res, _vuContext, _events, next) => {
            t.equal(
              _req.searchParams.toString(),
              'hello=world&ids=1&ids=2&ids=3',
              'Array value properly formated into query string'
            );
            return next();
          },
          checkTemplateValueQuery: (_req, _res, _vuContext, _events, next) => {
            t.equal(
              _req.searchParams.toString(),
              'hello=world&ids=1&ids=2&ids=3&name=Nalini',
              'Query string properly formatted'
            );
            return next();
          },
          getName: (_req, context, _ee, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {}
    };

    await new Promise((resolve) => {
      runScenario(initialContext, function userDone(err) {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), 'Should have made a request to /blah');
        t.end();
        resolve();
      });
    });
  });

  tap.test('hooks - afterResponse', async (t) => {
    const answer = 'the answer is 42';

    nock('http://localhost:8888').get('/answer').reply(200, answer);

    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          extractAnswer: (_req, res, vuContext, _events, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {}
    };

    await new Promise((resolve) => {
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
        resolve();
      });
    });
  });

  tap.test('hooks - beforeScenario', async (t) => {
    const endpoint = '/products';
    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          setEndpoint: (context, ee, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {},
      scenario: script.scenarios[0]
    };

    await new Promise((resolve) => {
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
        resolve();
      });
    });
  });

  tap.test('hooks - afterScenario', async (t) => {
    const endpoint = '/products';
    const productsCount = 123;
    const script = {
      config: {
        target: 'http://localhost:8888',
        processor: {
          checkProductsCount: (context, _ee, next) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    const initialContext = {
      vars: {},
      scenario: script.scenarios[0]
    };

    await new Promise((resolve) => {
      runScenario(initialContext, function userDone(err) {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), `Should have made a request to ${endpoint}`);

        t.end();
        resolve();
      });
    });
  });

  tap.test('Redirects', async (t) => {
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
    await engine.init();
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

    await new Promise((resolve) => {
      runScenario(initialContext, (err) => {
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
        resolve();
      });
    });
  });

  test('proxies', async (t) => {
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
    await engine.init();
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

    t.test('HTTP_PROXY', async (t) => {
      const httpProxy = 'http://proxy.url';

      process.env.HTTP_PROXY = httpProxy;
      const engine = new HttpEngine(script);
      await engine.init();

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

    t.test('HTTP_PROXY and HTTPS_PROXY', async (t) => {
      process.env.HTTP_PROXY = httpProxy;
      process.env.HTTPS_PROXY = httpsProxy;
      const engine = new HttpEngine(script);
      await engine.init();

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

  tap.test('followRedirect', async (t) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const counters = {};

    ee.on('counter', (name, val) => {
      counters[name] = (counters[name] || 0) + val;
    });

    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
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
        resolve();
      });
    });
  });

  tap.test('Forms - urlencoded', async (t) => {
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
    await engine.init();
    const ee = new EventEmitter();
    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario(initialContext, (err) => {
        if (err) {
          t.fail();
        }

        t.ok(target.isDone(), 'Should have made a request to /submit');

        t.end();
        resolve();
      });
    });
  });

  tap.test('Forms - formData multipart', async (t) => {
    nock('http://localhost:8888')
      .post(
        '/submit',
        (body) =>
          body.match(
            /Content-Disposition: form-data[\s\S]+activity[\s\S]+surfing/gi
          ).length &&
          body.match(
            /Content-Disposition: form-data[\s\S]+climate[\s\S]+Content-Type: application\/json[\s\S]+{"temperature": 25, "unit": "Celcius"}/gi
          ).length
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
                  location: '{{ location }}',
                  climate: {
                    value:
                      '{"temperature": {{ climate.temperature }}, "unit": "{{ climate.unit }}"}',
                    contentType: 'application/json'
                  }
                }
              }
            }
          ]
        }
      ]
    };

    const engine = new HttpEngine(script);
    await engine.init();
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
        activity: 'surfing',
        climate: {
          temperature: 25,
          unit: 'Celcius'
        }
      }
    };

    await new Promise((resolve) => {
      runScenario(initialContext, (err) => {
        if (err) {
          t.fail();
        }

        t.equal(counters['http.codes.200'], 1, 'Should have one 200 response');

        t.end();
        resolve();
      });
    });
  });

  // --- Tests added for Got v14 upgrade regression coverage ---

  tap.test('timeout - request fails after configured timeout', async (t) => {
    const target = nock('http://localhost:8888')
      .get('/slow')
      .delay(3000)
      .reply(200, 'ok');

    const script = {
      config: {
        target: 'http://localhost:8888',
        timeout: 1 // 1 second
      },
      scenarios: [
        {
          flow: [{ get: { url: '/slow' } }]
        }
      ]
    };

    const engine = new HttpEngine(script);
    await engine.init();
    const ee = new EventEmitter();

    const errors = [];
    ee.on('error', (errCode) => {
      errors.push(errCode);
    });

    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        t.ok(err, 'Should error on timeout');
        t.match(
          err.code || err.message,
          /TIMEOUT|timeout|ETIMEDOUT/i,
          'Error should indicate timeout'
        );
        t.end();
        resolve();
      });
    });

    nock.cleanAll();
  });

  tap.test('retry disabled - only one request attempt on error', async (t) => {
    let requestCount = 0;
    const target = nock('http://localhost:8888')
      .get('/fail')
      .times(5)
      .reply(() => {
        requestCount++;
        return [500, 'Internal Server Error'];
      });

    const script = {
      config: {
        target: 'http://localhost:8888'
      },
      scenarios: [
        {
          flow: [{ get: { url: '/fail' } }]
        }
      ]
    };

    const engine = new HttpEngine(script);
    await engine.init();
    const ee = new EventEmitter();

    const counters = {};
    ee.on('counter', (name, val) => {
      counters[name] = (counters[name] || 0) + val;
    });

    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        t.notOk(err, 'Should not error (throwHttpErrors is false)');
        t.equal(requestCount, 1, 'Should make exactly 1 request (no retries)');
        t.equal(
          counters['http.requests'],
          1,
          'http.requests counter should be 1'
        );
        t.equal(
          counters['http.codes.500'],
          1,
          'Should record the 500 status code'
        );
        t.end();
        resolve();
      });
    });
  });

  tap.test('timings.phases shape', async (t) => {
    const http = require('node:http');
    const srv = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });

    await new Promise((resolve) => srv.listen(0, resolve));
    const srvPort = srv.address().port;

    const script = {
      config: {
        target: `http://127.0.0.1:${srvPort}`,
        http: { extendedMetrics: true }
      },
      scenarios: [
        {
          flow: [{ get: { url: '/' } }]
        }
      ]
    };

    const engine = new HttpEngine(script);
    await engine.init();
    const ee = new EventEmitter();

    const histograms = {};
    ee.on('histogram', (name, value) => {
      histograms[name] = value;
    });

    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        t.notOk(err, 'Should complete without error');

        t.ok(
          'http.response_time' in histograms,
          'Should emit http.response_time (firstByte)'
        );
        t.type(
          histograms['http.response_time'],
          'number',
          'firstByte should be a number'
        );

        t.ok('http.dns' in histograms, 'Should emit http.dns');
        t.type(histograms['http.dns'], 'number', 'dns should be a number');

        t.ok('http.tcp' in histograms, 'Should emit http.tcp');
        t.type(histograms['http.tcp'], 'number', 'tcp should be a number');

        t.ok('http.total' in histograms, 'Should emit http.total');
        t.type(histograms['http.total'], 'number', 'total should be a number');

        srv.close();
        t.end();
        resolve();
      });
    });
  });

  tap.test('error name - HTTPError check', async (t) => {
    // Verify that Got v14 still uses 'HTTPError' as the error name
    // when throwHttpErrors is true
    const got = (await import('got')).default;
    try {
      const target = nock('http://localhost:8888')
        .get('/not-found')
        .reply(404, 'Not Found');
      await got('http://localhost:8888/not-found', {
        retry: { limit: 0 },
        throwHttpErrors: true
      });
      t.fail('Should have thrown');
    } catch (err) {
      t.equal(err.name, 'HTTPError', 'Error name should be HTTPError');
      t.equal(err.response.statusCode, 404, 'Should have 404 status');
    }
    t.end();
  });

  tap.test('downloadProgress - bytes metric emitted', async (t) => {
    const responseBody = 'x'.repeat(1024);
    const target = nock('http://localhost:8888')
      .get('/download')
      .reply(200, responseBody);

    const script = {
      config: {
        target: 'http://localhost:8888'
      },
      scenarios: [
        {
          flow: [{ get: { url: '/download' } }]
        }
      ]
    };

    const engine = new HttpEngine(script);
    await engine.init();
    const ee = new EventEmitter();

    const counters = {};
    ee.on('counter', (name, val) => {
      counters[name] = (counters[name] || 0) + val;
    });

    const runScenario = engine.createScenario(script.scenarios[0], ee);

    await new Promise((resolve) => {
      runScenario({ vars: {} }, function userDone(err) {
        t.notOk(err, 'Should complete without error');
        t.ok(
          'http.downloaded_bytes' in counters,
          'Should emit http.downloaded_bytes counter'
        );
        t.ok(
          counters['http.downloaded_bytes'] >= 0,
          'downloaded_bytes should be >= 0'
        );
        t.end();
        resolve();
      });
    });
  });

  tap.test(
    'GOT_OPTION_NAMES - unknown options do not cause errors',
    async (t) => {
      const target = nock('http://localhost:8888')
        .get('/options-test')
        .reply(200, 'ok');

      const script = {
        config: {
          target: 'http://localhost:8888',
          processor: {
            addUnknownOption: (req, _ctx, _ee, next) => {
              // Add options that should be filtered out by _.pick
              req.uuid = 'test-uuid-123';
              req.customThing = 'should-be-stripped';
              req.capture = { json: '$.foo', as: 'bar' };
              req.name = 'my-request';
              return next();
            }
          }
        },
        scenarios: [
          {
            flow: [
              {
                get: {
                  url: '/options-test',
                  beforeRequest: 'addUnknownOption'
                }
              }
            ]
          }
        ]
      };

      const engine = new HttpEngine(script);
      await engine.init();
      const ee = new EventEmitter();

      const counters = {};
      ee.on('counter', (name, val) => {
        counters[name] = (counters[name] || 0) + val;
      });

      const runScenario = engine.createScenario(script.scenarios[0], ee);

      await new Promise((resolve) => {
        runScenario({ vars: {} }, function userDone(err) {
          t.notOk(
            err,
            'Should not error even with unknown options on requestParams'
          );
          t.equal(
            counters['http.codes.200'],
            1,
            'Request should succeed with 200'
          );
          t.ok(target.isDone(), 'Should have made the request');
          t.end();
          resolve();
        });
      });
    }
  );

  tap.end();
});
