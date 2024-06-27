const tap = require('tap');
const { execute } = require('../helpers');
const execa = require('execa');

tap.test('GH #215 regression', async (t) => {
  const abortController = new AbortController();
  execa('node', ['./test/targets/gh_215_target.js'], {
    signal: abortController.signal
  });

  const [exitCode, output] = await execute([
    'run',
    'test/scripts/gh_215_add_token.json'
  ]);
  abortController.abort();

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.notOk(
    output.stdout.includes('ECONNREFUSED'),
    'Should not have connection refused errors'
  );
});

tap.test('Exits with non zero when an unknown command is used', async (t) => {
  const [exitCode] = await execute([
    'run',
    'makemeasandwich',
    '--with',
    'cheese'
  ]);
  t.not(exitCode, 0, 'CLI should error with non-zero exit code');
});

tap.test('Exits with non zero when an unknown option is used', async (t) => {
  const [exitCode] = await execute(['run', '--with', 'cheese']);

  t.not(exitCode, 0, 'CLI should error with non-zero exit code');
});

tap.test(
  'Exits with 0 when a known flag is used with no command',
  async (t) => {
    const [exitCode] = await execute(['run', '-V']);

    t.not(exitCode, 0, 'CLI should error with non-zero exit code');
  }
);

tap.test('Suggest similar commands if unknown command is used', async (t) => {
  const [exitCode, output] = await execute(['helpp']);
  t.equal(exitCode, 127, 'CLI should error with exit code 127');
  t.ok(
    output.stderr.includes('Did you mean'),
    'Should suggest similar commands'
  );
});

tap.test('Exit early if Artillery Cloud API is not valid', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--record',
    '--key',
    '123',
    'test/scripts/gh_215_add_token.json'
  ]);

  t.equal(exitCode, 7);
  t.ok(output.stderr.includes('API key is not recognized'));
});

tap.test(
  'Exit early if Artillery Cloud API is not valid - on Fargate',
  async (t) => {
    const [exitCode, output] = await execute([
      'run-fargate',
      '--record',
      '--key',
      '123',
      'test/scripts/gh_215_add_token.json'
    ]);

    t.equal(exitCode, 7);
    t.ok(output.stderr.includes('API key is not recognized'));
  }
);

/*
 @test "Running a script that uses XPath capture when libxmljs is not installed produces a warning" {
     if [[ ! -z `find . -name "artillery-xml-capture" -type d` ]]; then
       find . -name "artillery-xml-capture" -type d | xargs rm -r
     fi
     ./bin/run run --config ./test/scripts/hello_config.json ./test/scripts/hello_with_xpath.json  | grep 'artillery-xml-capture'
     grep_status=$?
     npm install artillery-xml-capture || true
     [ $grep_status -eq 0 ]
 }
 TODO: Rewrite without quick
 @test "Clean up when killed" {
   MULTICORE=1 ARTILLERY_WORKERS=4 ./bin/run quick -d 120 -r 1 http://localhost:3003/ &
   artillery_pid=$!
   sleep 5
   kill $artillery_pid
   sleep 4
   [[ -z $(pgrep -lfa node | grep worker.js) ]]
 }
*/
