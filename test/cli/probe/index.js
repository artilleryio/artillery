// TODO: zxify this
const tap = require('tap');
const { a9 } = require('../_helpers.js');

tap.test('Run with no arguments', async (t) => {
  const { stdout } = await a9(['probe']);
  t.equal(true, stdout.indexOf('USAGE') > -1, 'Should see usage info');
});

tap.test('Basic probes', async (t) => {
  const { stdout } = await a9(['http', 'www.artillery.io']);

  t.equal(true, stdout.indexOf('content-type') > -1, 'Displays content-type header');
  t.equal(true, stdout.indexOf('date') > -1, 'Displays date header');
  t.equal(true, stdout.indexOf('DNS Lookup') > -1, 'Displays request waterfall');
  t.equal(true, stdout.indexOf('stored in') > -1, 'Displays request body filename path');
});

tap.test('HTTP Basic Auth', async (t) => {
  const { stdout } = await a9(['http', 'http://httpbin.org/basic-auth/tiki/pony1', '--auth', '{user: tiki, pass: pony1}']);
  t.equal(true, stdout.indexOf('200 OK') > -1, 'Passes Basic Auth credentials');
});

tap.test('HTTP POST with JSON body', async (t) => {
  const { stdout } = await a9(['http', 'post', 'http://lab.artillery.io/login', '--json', '{username: testuser, password: testpassword}']);
  t.equal(true, stdout.indexOf('200 OK') > -1, 'Passes JSON post body');
});