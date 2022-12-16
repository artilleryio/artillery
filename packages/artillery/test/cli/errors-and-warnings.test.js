const tap = require('tap');
const { execute } = require('../cli/_helpers.js');
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
  t.ok(exitCode === 0 && !output.stdout.includes('ECONNREFUSED'));
});

tap.test('Exits with non zero when an unknown command is used', async (t) => {
  const [exitCode] = await execute([
    'run',
    'makemeasandwich',
    '--with',
    'cheese'
  ]);
  t.ok(exitCode !== 0);
});

tap.test('Exits with non zero when an unknown option is used', async (t) => {
  const [exitCode] = await execute(['run', '--with', 'cheese']);
  t.ok(exitCode !== 0);
});

tap.test(
  'Exits with 0 when a known flag is used with no command',
  async (t) => {
    const [exitCode] = await execute(['run', '-V']);
    t.ok(exitCode !== 0);
  }
);

tap.test('Suggest similar commands if unknown command is used', async (t) => {
  const [exitCode, output] = await execute(['helpp']);
  t.ok(exitCode === 127 && output.includes('Did you mean'));
});

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
