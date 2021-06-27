'use strict';

const test = require('tape');
const createRunner = require('../../../lib/runner-sp');
const path = require('path');

test('Should execute a simple function', (t) => {
  startRunner('simple_function.json', {}, t, (stats) => {
    t.deepEquals(stats._errors, {}, 'No errors');
    t.equals(stats._counters['simpleFunction'], 1, 'Function "simpleFunction" called once');
  });
});

test('Should await async function', (t) => {
  startRunner('async_function.json', {}, t, (stats) => {
    t.deepEquals(stats._errors, {}, 'No errors');
    t.equals(stats._counters['asyncFunctionOrder'], 1, 'Function "asyncFunction" finished first');
    t.equals(stats._counters['otherFunctionOrder'], 2, 'Function "otherFunction" finished second');
  });
});

test('Should emit error if function does not exist', (t) => {
  startRunner('undefined_function.json', {}, t, (stats) => {
    t.equals(stats._errors['Undefined function "undefinedFunction"'], 1, 'Undefined function error count');
  });
});

test('Should emit error with "code" argument if function calls next({ code: 123 })', (t) => {
  startRunner('error_code_function.json', {}, t, (stats) => {
    t.equals(stats._errors['123'], 1, 'Function finished with error');
  });
});

test('Should emit error with "message" argument if function calls next({ message: "AwesomeErrorMessage" })', (t) => {
  startRunner('error_message_function.json', {}, t, (stats) => {
    t.equals(stats._errors['AwesomeErrorMessage'], 1, 'Function finished with error');
  });
});

function startRunner(scriptName, payload, t, doneCallback) {
  const scriptPath = path.join(__dirname, 'scripts', scriptName);
  const script = require(scriptPath);
  const opts = { script, scriptPath };

  const runner = createRunner(script, payload, opts);
  const ee = runner.events;
  ee.on('done', (stats) => {
    doneCallback(stats);
    runner.shutdown(() => t.end());
  });

  runner.run();
}
