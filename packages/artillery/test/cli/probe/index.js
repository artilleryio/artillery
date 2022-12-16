// TODO: zxify this
const tap = require('tap');
const { execute } = require('../_helpers.js');

tap.test('Run with no arguments', async (t) => {
  const [exitCode, output] = await execute(['probe']);
  t.equal(true, output.stdout.includes('USAGE'), 'Should see usage info');
  t.equal(0, exitCode, 'Exits with no error');
});

tap.test('Basic probes', async (t) => {
  const [exitCode, output] = await execute(['http', 'http://asciiart.artillery.io:8080/dino']);

  t.equal(0, exitCode, 'Exits with no error');
  t.equal(
    true,
    output.stdout.includes('content-type'),
    'Displays content-type header'
  );
  t.equal(true, output.stdout.includes('date'), 'Displays date header');
  t.equal(
    true,
    output.stdout.includes('DNS Lookup'),
    'Displays request waterfall'
  );
  t.equal(
    true,
    output.stdout.includes('stored in'),
    'Displays request body filename path'
  );
});

tap.test('HTTP Basic Auth', async (t) => {
  const [exitCode, output] = await execute([
    'http',
    'http://httpbin.org/basic-auth/tiki/pony1',
    '--auth',
    '{user: tiki, pass: pony1}'
  ]);
  t.equal(0, exitCode, 'Exits with no error');
  t.equal(true, output.stdout.includes('200 OK'), 'Passes Basic Auth credentials');
});

tap.test('HTTP POST with JSON body', async (t) => {
  const [exitCode, output] = await execute([
    'http',
    'post',
    'http://lab.artillery.io/login',
    '--json',
    '{username: testuser, password: testpassword}'
  ]);
  t.equal(0, exitCode, 'Exits with no error');
  t.equal(true, output.stdout.includes('200 OK'), 'Passes JSON post body');
});

tap.test('Custom headers can be set', async (t) => {
  const [exitCode, output] = await execute([
    'http',
    'https://httpbin.org/headers',
    '-b',
    '-H',
    'x-my-header: pony',
    '-q',
    'headers|keys(@)|contains(@,\'X-My-Header\')'
  ]);
  t.equal(0, exitCode, 'Exits with no error');
  t.equal(
    true,
    output.stdout.includes('true'),
    'x-my-header set and reflected back'
  );
});

tap.test('HTTP/2 is used by default', async (t) => {
  const [exitCode, output] = await execute(['http', 'https://www.cloudflare.com/']);
  t.equal(0, exitCode, 'Exits with no error');
  t.equal(
    true,
    output.stdout.includes('HTTP/2'),
    'Response is served over HTTP/2'
  );
});

tap.test('Kitchen sink', async (t) => {
  const [exitCode, output] = await execute([
    'http',
    'post',
    'http://lab.artillery.io/login',
    '-H',
    '{x-my-header: something}',
    '-H',
    'x-content-type: something',
    '--json',
    '{username: testuser, password: testpassword}',
    '-v',
    '--qs',
    'animal=pony',
    '-e',
    '{statusCode: 200}',
    '-e',
    '{headerEquals: [x-powered-by, Express]}',
    '-e',
    '{hasHeader: etag}'
  ]);
  t.equal(0, exitCode, 'Exits with no error');
  t.equal(
    true,
    output.stdout.includes('POST /login?animal=pony HTTP/1.1'),
    'request details are printed when using -v'
  );
  t.equal(
    true,
    output.stdout.includes('Response'),
    'Response section is marked when using -v'
  );
  t.equal(
    true,
    output.stdout.includes('Expectations:'),
    'Expectations section is marked when using -e'
  );
  t.equal(true, !output.stdout.includes('not ok'), 'All expectations pass');
});
