/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const test = require('tape');
const sinon = require('sinon');

const HttpEngine = require('../../lib/engine_http');
const EventEmitter = require('events');
const nock = require('nock');
const path = require('path');
const fs = require('fs');

const THINKTIME_SEC = 1;

const script = {
  config: {
    target: 'http://localhost:8888',
    processor: {
      f: function(context, ee, next) {
        context.vars.newVar = 1234;
        return next();
      },

      inc: function(context, ee, next) {
        context.vars.inc = context.vars.$loopCount;
        return next();
      }
    }
  },
  scenarios: [
    {
      name: 'Whatever',
      flow: [
        { think: THINKTIME_SEC },
        { function: 'f' },
        { log: 'This is printed from the script with "log": {{ newVar }}' },
        { loop: [
          { function: 'inc' },
          { think: 1 }
        ], count: 3 }
      ]
    }
  ]
};

test('HTTP engine interface', function(t) {
  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  t.assert(engine, 'Can construct an engine');
  t.assert(typeof runScenario === 'function', 'Can use the engine to create virtual user functions');
  t.end();
});

test('HTTP virtual user', function(t) {
  const engine = new HttpEngine(script);
  const ee = new EventEmitter();
  const spy = sinon.spy(console, 'log');
  const runScenario = engine.createScenario(script.scenarios[0], ee);

  ee.once('started', onStarted);

  const initialContext = {
    vars: {}
  };

  t.plan(6);

  const startedAt = Date.now();
  runScenario(initialContext, function userDone(err, finalContext) {
    const finishedAt = Date.now();
    t.assert(!err, 'Virtual user finished successfully');
    t.assert(finalContext.vars.newVar === 1234, 'Function spec was executed');
    t.assert(finishedAt - startedAt >= THINKTIME_SEC * 1000, 'User spent some time thinking');

    const expectedLog = 'This is printed from the script with "log": 1234';
    let seen = false;
    spy.args.forEach(function(args) {
      if (args[0] === expectedLog) {
        t.comment(`string: "${args[0]}" found`);
        seen = true;
      }
    });
    t.assert(seen, 'log worked');
    console.log.restore(); // unwrap the spy
    // loop count starts at 0, hence 2 rather than 3 here:
    t.assert(finalContext.vars.inc === 2, 'Function called in a loop');
  });

  function onStarted() {
    t.assert(true, 'started event emitted');
  }
});

test('url and uri parameters', function (t) {
  const target = nock('http://localhost:8888')
    .get('/hello')
    .reply(200, 'ok');

  const script = {
    config: {
      target: 'http://localhost:8888',
      processor: {
        rewriteUrl: function(req, context, ee, next) {
          req.uri = '/hello';
          return next();
        },
        printHello: function(req, context, ee, next) {
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
              beforeRequest: 'rewriteUrl'
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

    t.assert(target.isDone(), 'Should have made a request to /hello');

    const expectedLog = '# hello from printHello hook!';
    let seen = false;
    spy.args.forEach(function(args) {
      if (args[0] === expectedLog) {
        t.comment(`string: "${args[0]}" found`);
        seen = true;
      }
    });
    t.assert(seen, 'scenario-level beforeRequest worked');
    console.log.restore(); // unwrap the spy

    t.end();
  });
});

test('file as body', function (t) {
  const target = nock('http://localhost:8888')
    .post('/hello')
    .reply(200, 'ok');

  const files = ['../files/image.png', '../files/archive.tar'].reduce((streamMap, relative) => {
    const resolved = path.resolve(__dirname, relative);
    return Object.assign(streamMap, { [relative]: fs.createReadStream(resolved) });
  }, {});

  const script = {
    config: {
      target: 'http://localhost:8888',
      files: files
    },
    scenarios: [
      {
        name: 'Whatever',
        flow: [
          {
            post: {
              uri: '/hello',
              body: '@../files/image.png'
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

    t.assert(target.isDone(), 'Should have made a request to /hello with formData');
    t.end();
  });
});

test('files in formData', function (t) {
  const target = nock('http://localhost:8888', {
    reqheaders: {
      'content-type': /multipart/
    }
  })
    .post('/hello', function (body) {
      return Boolean(body.length);
    })
    .reply(200, 'ok');

  const files = ['../files/image.png', '../files/archive.tar'].reduce((streamMap, relative) => {
    const resolved = path.resolve(__dirname, relative);
    return Object.assign(streamMap, { [relative]: fs.createReadStream(resolved) });
  }, {});

  const script = {
    config: {
      target: 'http://localhost:8888',
      files: files
    },
    scenarios: [
      {
        name: 'Whatever',
        flow: [
          {
            post: {
              uri: '/hello',
              formData: {
                'preview_img': '@../files/image.png',
                data: '@../files/image.png'
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

  const initialContext = {
    vars: {}
  };

  runScenario(initialContext, function userDone(err, finalContext) {
    if (err) {
      t.fail();
    }

    t.assert(target.isDone(), 'Should have made a request to /hello with formData');
    t.end();
  });
});
