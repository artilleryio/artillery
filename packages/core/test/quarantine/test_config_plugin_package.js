/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { test } = require('tap');
const runner = require('../..').runner.runner;
const path = require('node:path');

test('Plugin package name inside plugin config', (t) => {
  runTest(t, path.resolve(__dirname, '../scripts/plugin_packaged_inner.json'));
});

test('Plugin package name outside plugin config', (t) => {
  runTest(t, path.resolve(__dirname, '../scripts/plugin_packaged_outer.json'));
});

test('Plugin package name inside plugin config overriding outter package name', (t) => {
  runTest(
    t,
    path.resolve(
      __dirname,
      './scripts/plugin_packaged_inner_override_outter.json'
    )
  );
});

test('Normal artillery-plugin-*', (t) => {
  runTest(t, path.resolve(__dirname, '../scripts/artillery_plugin.json'));
});

function runTest(t, scriptName) {
  const script = require(scriptName);
  console.log(script);
  runner(script).then((ee) => {
    ee.on('plugin_loaded', (_stats) => {
      console.log('hey');
      t.ok(true);
      t.end();
    });

    ee.run();
  });
}
