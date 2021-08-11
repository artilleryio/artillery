'use strict';

const test = require('tap').test;
const createRunner = require('../../../lib/launch-local');
const sleep = require('../../../lib/util/sleep');
const path = require('path');

test('Should execute a simple function', async (t) => {
  await runOnDone('simple_function.json', {}, async (stats) => {
    t.same(
      Object.keys(stats.counters).filter((counter) =>
        counter.startsWith('errors.')
      ),
      [],
      'No errors'
    );
    t.equal(
      stats.counters['simpleFunction'],
      1,
      'Function "simpleFunction" called once'
    );
  });
});

test('Should await async function', async (t) => {
  await runOnDone('async_function.json', {}, async (stats) => {
    t.same(
      Object.keys(stats.counters).filter((counter) =>
        counter.startsWith('errors.')
      ),
      [],
      'No errors'
    );
    t.equal(
      stats.counters['asyncFunctionOrder'],
      1,
      'Function "asyncFunction" finished first'
    );
    t.equal(
      stats.counters['otherFunctionOrder'],
      2,
      'Function "otherFunction" finished second'
    );
  });
});

test('Should emit error if function does not exist', async (t) => {
  await runOnDone('undefined_function.json', {}, async (stats) => {
    t.equal(
      stats.counters['errors.Undefined function "undefinedFunction"'],
      1,
      'Undefined function error count'
    );
  });
});

test('Should emit error with "code" argument if function calls next({ code: 123 })', async (t) => {
  await runOnDone('error_code_function.json', {}, async (stats) => {
    t.equal(stats.counters['errors.123'], 1, 'Function finished with error');
  });
});

test('Should emit error with "message" argument if function calls next({ message: "AwesomeErrorMessage" })', async (t) => {
  await runOnDone('error_message_function.json', {}, async (stats) => {
    t.equal(
      stats.counters['errors.AwesomeErrorMessage'],
      1,
      'Function finished with error'
    );
  });
});


async function runOnDone(scriptName, payload, fn) {
  const scriptPath = path.join(__dirname, 'scripts', scriptName);
  const script = require(scriptPath);
  const opts = { script, scriptPath };

  const runner = await createRunner(script, payload, opts);
  let done = false;

  runner.events.once('done', async (stats) => {
    await fn(stats);
    await runner.shutdown();
    done = true;
  });
  runner.run();
  while(!done) { await sleep(1000); }
}
