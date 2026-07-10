/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */



const { test } = require('tap');
const path = require('node:path');
let loadProcessor;

const scriptPath = path.join(__dirname, 'dummy-script.yml');

const __tap = require('tap');
// Modules under test are ES modules - load before tests run
__tap.before(async () => {
  ({ loadProcessor } = (await import('../../lib/runner.ts')).runnerFuncs);
});

function makeScript(processorPath) {
  return {
    config: {
      processor: processorPath
    },
    scenarios: []
  };
}

const FORMATS = [
  { name: 'CJS .js', file: './fixtures/processors/proc-cjs.js' },
  { name: 'CJS .cjs', file: './fixtures/processors/proc.cjs' },
  { name: 'ESM .mjs', file: './fixtures/processors/proc.mjs' },
  {
    name: 'ESM .js (type: module)',
    file: './fixtures/processors/esm/proc.js'
  },
  {
    name: 'ESM .js with top-level await',
    file: './fixtures/processors/esm/proc-tla.js'
  }
];

for (const { name, file } of FORMATS) {
  test(`loadProcessor - ${name}`, async (t) => {
    const script = await loadProcessor(makeScript(file), { scriptPath });
    const processor = script.config.processor;

    t.type(processor.greet, 'function', 'exported function is available');
    t.type(processor.formatName, 'string', 'exported value is available');

    await new Promise((resolve) => {
      const context = { vars: {} };
      processor.greet(context, null, () => {
        t.match(context.vars.greeting, /^hello from /, 'function is callable');
        resolve();
      });
    });
  });
}

test('loadProcessor - ESM default export is unwrapped', async (t) => {
  const script = await loadProcessor(
    makeScript('./fixtures/processors/esm/proc-default.js'),
    { scriptPath }
  );
  const processor = script.config.processor;

  t.type(
    processor.greet,
    'function',
    'function from default export is available'
  );
  t.type(
    processor.namedAlongsideDefault,
    'function',
    'named export alongside default is available'
  );
});

test('loadProcessor - result is a plain mutable object', async (t) => {
  // Regression test: ESM module namespace objects are frozen; assigning
  // to them is a silent no-op (sloppy mode). The Playwright engine and
  // plugins attach properties to the processor object (e.g.
  // $rewriteMetricName) - so loadProcessor must return a mutable copy
  for (const { name, file } of FORMATS) {
    const script = await loadProcessor(makeScript(file), { scriptPath });
    const processor = script.config.processor;

    const marker = () => 'attached';
    processor.$rewriteMetricName = marker;
    t.equal(
      processor.$rewriteMetricName,
      marker,
      `property assignment sticks (${name})`
    );
  }
});

test('loadProcessor - no processor configured is a no-op', async (t) => {
  const script = { config: {}, scenarios: [] };
  const result = await loadProcessor(script, { scriptPath });
  t.equal(result, script, 'script returned unchanged');
  t.equal(result.config.processor, undefined, 'no processor added');
});
