'use strict';

const test = require('tape');
const assert = require('assert');
const http = require('http');
const createRunner = require('../../../lib/launch-local');

const stats = {};
const targetServer = runServer().listen(0);
const beforeEndpoint = '/auth';
const afterEndpoint = '/logout';
const scenarioEndpoint = '/data';

const script = {
  config: {
    target: `http://127.0.0.1:${targetServer.address().port}`,
    phases: [{ duration: 3, arrivalRate: 2 }],
  },
  before: {
    flow: [
      {
        post: {
          url: beforeEndpoint,
          capture: {
            json: '$.token',
            as: 'token',
          },
        },
      },
    ],
  },
  after: {
    flow: [
      {
        post: {
          url: afterEndpoint,
          json: { token: '{{ token }}' },
        },
      },
    ],
  },
  scenarios: [
    {
      flow: [
        {
          get: {
            url: scenarioEndpoint,
            headers: {
              authorization: 'Bearer {{ token }}',
            },
          },
        },
      ],
    },
  ],
};

const authToken = 'abcdefg';

test('Before/After hooks', async (t) => {
  const runner = await createRunner(script, {}, { scriptPath: '.' });

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

    targetServer.close(t.end);
  });

  runner.run();
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
    if (req.url === beforeEndpoint) {
      res.setHeader('Content-Type', 'application/json');

      return res.end(
        JSON.stringify({
          token: authToken,
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
