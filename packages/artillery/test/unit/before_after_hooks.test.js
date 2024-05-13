'use strict';

const { test } = require('tap');
const assert = require('assert');
const http = require('http');
const { cloneDeep } = require('lodash');
const createLauncher = require('../../lib/launch-platform');
const {
  beforeHookBeforeRequest,
  afterHookBeforeRequest
} = require('./processor');
const path = require('path');

let stats = {};
const beforeEndpoint = '/auth';
const afterEndpoint = '/logout';
const scenarioEndpoint = '/data';

const targetServer = runServer().listen(0);
const script = {
  config: {
    target: `http://127.0.0.1:${targetServer.address().port}`,
    phases: [{ duration: 3, arrivalRate: 2 }]
  },
  before: {
    flow: [
      {
        post: {
          url: beforeEndpoint,
          capture: {
            json: '$.token',
            as: 'token'
          }
        }
      }
    ]
  },
  after: {
    flow: [
      {
        post: {
          url: afterEndpoint,
          json: { token: '{{ token }}' }
        }
      }
    ]
  },
  scenarios: [
    {
      flow: [
        {
          get: {
            url: scenarioEndpoint,
            headers: {
              authorization: 'Bearer {{ token }}'
            }
          }
        }
      ]
    }
  ],
  _configPath: 'fakepath.yml'
};

const authToken = 'abcdefg';

test('before/after hooks', (t) => {
  const s = cloneDeep(script);
  createLauncher(s, {}, { scriptPath: '.' }).then((runner) => {
    runner.events.once('done', async () => {
      await runner.shutdown();

      t.equal(
        stats[beforeEndpoint],
        1,
        'should have made one request to the "before" endpoint'
      );
      t.equal(
        stats[afterEndpoint],
        1,
        'should have made one request to "after" endpoint'
      );

      t.equal(
        stats[scenarioEndpoint],
        script.config.phases[0].duration * script.config.phases[0].arrivalRate,
        'should call the endpoint in the scenario section'
      );

      // reset stats
      stats = {};

      t.end();
    });

    runner.run();
  });
});

test('before/after hooks - processor', (t) => {
  const s = cloneDeep(script);

  beforeHookBeforeRequest.resetHistory();
  afterHookBeforeRequest.resetHistory();

  s.config.processor = path.resolve(`${__dirname}/processor.js`);

  s.before.flow[0] = {
    ...s.before.flow[0],
    post: {
      ...s.before.flow[0].post,
      beforeRequest: 'beforeHookBeforeRequest'
    }
  };

  s.after.flow[0] = {
    ...s.after.flow[0],
    post: {
      ...s.after.flow[0].post,
      beforeRequest: 'afterHookBeforeRequest'
    }
  };

  createLauncher(s, {}, { scriptPath: '.' }).then((runner) => {
    runner.events.once('done', async () => {
      await runner.shutdown();

      t.ok(
        beforeHookBeforeRequest.calledOnce,
        'should call processor functions in before hook'
      );
      t.ok(
        afterHookBeforeRequest.calledOnce,
        'should call processor functions in after hook'
      );

      // reset stats
      stats = {};

      t.end();
    });

    runner.run();
  });
});

test('before/after hooks - payload', (t) => {
  const s = cloneDeep(script);
  const payloadValue = 'value';

  s.config.payload = [
    {
      path: '.',
      fields: ['field1'],
      data: [[payloadValue]]
    }
  ];

  s.before.flow[0] = {
    ...s.before.flow[0],
    post: {
      ...s.before.flow[0].post,
      url: `${beforeEndpoint}/{{ field1 }}`
    }
  };

  createLauncher(s, s.config.payload, { scriptPath: '.' }).then((runner) => {
    runner.events.once('done', async () => {
      await runner.shutdown();

      t.equal(
        stats[`${beforeEndpoint}/${payloadValue}`],
        1,
        'should be able to use payload values in the "before" hook'
      );

      t.equal(
        stats[scenarioEndpoint],
        script.config.phases[0].duration * script.config.phases[0].arrivalRate,
        'should call the endpoint in the scenario section'
      );

      // reset stats
      stats = {};

      t.end();
    });

    runner.run();
  });
});

test('before/after hooks - teardown', (t) => {
  targetServer.close(t.end);
});

function runServer() {
  const handleGetReqs = (req, res) => {
    assert.ok(
      req.headers['authorization'].endsWith(authToken),
      'it should share context vars captured in the "before" hook with the workers'
    );

    return res.end();
  };

  const handlePostReqs = (req, res) => {
    if (req.url.startsWith(beforeEndpoint)) {
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          token: authToken
        })
      );
    }

    if (req.url === afterEndpoint) {
      let body = '';

      req.on('data', (data) => {
        body += data;
      });

      req.on('end', () => {
        body = JSON.parse(body);

        assert.equal(
          body.token,
          authToken,
          'it should share the context vars with the after hook'
        );

        res.end();
      });
    }
  };

  return http.createServer((req, res) => {
    stats[req.url] = stats[req.url] || 0;
    stats[req.url]++;

    switch (req.method) {
      case 'POST':
        return handlePostReqs(req, res);
      case 'GET':
        return handleGetReqs(req, res);
      default:
        return res.writeHead(405).end();
    }
  });
}
