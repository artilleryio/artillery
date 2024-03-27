const { test, beforeEach, before, afterEach } = require('tap');
const http = require('http');
const { $ } = require('zx');
const path = require('path');

const A9 = process.env.A9 || path.join(__dirname, '../../bin/run');

function createServer() {
  return http.createServer((req, res) => {
    switch (req.method) {
      case 'POST':
        return res.writeHead(201).end();
      case 'GET':
        return res.writeHead(204).end();
      default:
        return res.writeHead(405).end();
    }
  });
}

let server;
let overrides;

before(async () => {
  await $`${A9} -V`;
});

beforeEach(async () => {
  server = createServer().listen(0);
  overrides = JSON.stringify({
    config: {
      phases: [{ duration: 2, arrivalRate: 2 }],
      target: `http://localhost:${server.address().port}`,
      processor: path.join(
        __dirname,
        '../scripts/scenario-with-custom-plugin/processor.js'
      ),
      plugins: {
        httphooks: {}
      }
    }
  });
});

afterEach(async () => {
  server.close();
});

test('plugins can attach functions to processor object', async (t) => {
  const output = await $`ARTILLERY_PLUGIN_PATH=${path.join(
    __dirname,
    '../plugins'
  )} ${A9} run --quiet --overrides ${overrides} ${path.join(
    __dirname,
    '../scripts/scenario-with-custom-plugin/custom-plugin.yml'
  )}`;

  t.match(output, /afterResponse hook/, 'plugin should have been called');
});
