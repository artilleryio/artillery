// TODO: zxify this
const tap = require('tap');
const { a9 } = require('../_helpers.js');

tap.test('Run with no arguments', async (t) => {
  const { stdout } = await a9(['probe']);
  t.equal(true, stdout.indexOf('USAGE') > -1, 'Should see usage info');
});

tap.test('Basic probes', async (t) => {
  const { stdout } = await a9(['http', 'http://asciiart.artillery.io:8080/dino']);

  t.equal(
    true,
    stdout.indexOf('content-type') > -1,
    'Displays content-type header'
  );
  t.equal(true, stdout.indexOf('date') > -1, 'Displays date header');
  t.equal(
    true,
    stdout.indexOf('DNS Lookup') > -1,
    'Displays request waterfall'
  );
  t.equal(
    true,
    stdout.indexOf('stored in') > -1,
    'Displays request body filename path'
  );
});

tap.test('HTTP Basic Auth', async (t) => {
  const { stdout } = await a9([
    'http',
    'http://httpbin.org/basic-auth/tiki/pony1',
    '--auth',
    '{user: tiki, pass: pony1}'
  ]);
  t.equal(true, stdout.indexOf('200 OK') > -1, 'Passes Basic Auth credentials');
});

tap.test('HTTP POST with JSON body', async (t) => {
  const { stdout } = await a9([
    'http',
    'post',
    'http://lab.artillery.io/login',
    '--json',
    '{username: testuser, password: testpassword}'
  ]);
  t.equal(true, stdout.indexOf('200 OK') > -1, 'Passes JSON post body');
});

tap.test('Custom headers can be set', async (t) => {
  const { stdout } = await a9([
    'http',
    'https://httpbin.org/headers',
    '-b',
    '-H',
    'x-my-header: pony',
    '-q',
    'headers|keys(@)|contains(@,\'X-My-Header\')'
  ]);
  t.equal(
    true,
    stdout.indexOf('true') > -1,
    'x-my-header set and reflected back'
  );
});

tap.test('HTTP/2 is used by default', async (t) => {
  const { stdout } = await a9(['http', 'https://www.cloudflare.com/']);
  t.equal(
    true,
    stdout.indexOf('HTTP/2') > -1,
    'Response is served over HTTP/2'
  );
});

tap.test('Kitchen sink', async (t) => {
  const { stdout } = await a9([
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
  t.equal(
    true,
    stdout.indexOf('POST /login?animal=pony HTTP/1.1') > -1,
    'request details are printed when using -v'
  );
  t.equal(
    true,
    stdout.indexOf('Response') > -1,
    'Response section is marked when using -v'
  );
  t.equal(
    true,
    stdout.indexOf('Expectations:') > -1,
    'Expectations section is marked when using -e'
  );
  t.equal(true, stdout.indexOf('not ok') === -1, 'All expectations pass');
});
