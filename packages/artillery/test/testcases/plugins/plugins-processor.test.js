const { test } = require('tap');
const http = require('http');
const { $ } = require('zx');
const path = require('path');

const A9 = process.env.A9 || path.join(__dirname, '../../../bin/run');

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

(async function () {
  const server = createServer().listen(0);

  const overrides = JSON.stringify({
    config: {
      phases: [{ duration: 2, arrivalRate: 2 }],
      target: `http://localhost:${server.address().port}`,
      processor: path.join(__dirname, '/processor.js'),
      plugins: {
        httphooks: {}
      }
    }
  });

  await $`${A9} -V`;

  test('plugins can attach functions to processor object', async (t) => {
    const output = await $`ARTILLERY_PLUGIN_PATH=${path.join(
      __dirname,
      '../../plugins'
    )} ${A9} run --quiet --overrides ${overrides} ${path.join(
      __dirname,
      '/script.json'
    )}`;

    t.match(output, /afterResponse hook/, 'plugin output');

    server.close(t.end);
  });
})();
