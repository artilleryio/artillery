'use strict';

const { test, beforeEach, afterEach } = require('tap');
const runner = require('../../..').runner.runner;
const { SSMS } = require('../../../lib/ssms');
const l = require('lodash');
const createTestServer = require('../targets/simple');

let server;
let port;
beforeEach(async () => {
  server = await createTestServer(0);
  port = server.info.port;
});

afterEach(() => {
  server.stop();
});

test('think', function (t) {
  const script = require('../scripts/thinks_http.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.equal(
        Object.keys(report.errors).length,
        0,
        'Should have reported no errors'
      );
      t.equal(
        Object.keys(report.codes).length,
        0,
        'Should have no http codes reported'
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('think - invalid think time', function (t) {
  const script = l.cloneDeep(require('../scripts/thinks_http.json'));
  script.config.target = `http://127.0.0.1:${port}`;
  delete script.scenarios[0].flow;
  script.scenarios[0].flow = [{ think: '1 potatoe' }];
  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(
        Object.keys(report.errors).includes('Invalid think time: 1 potatoe'),
        'should have an error in report'
      );
      t.equal(
        Object.keys(report.codes).length,
        0,
        'Should have no http codes reported'
      );
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('think - with defaults from config.http.defaults instead', function (t) {
  const script = l.cloneDeep(require('../scripts/thinks_http.json'));
  script.config.target = `http://127.0.0.1:${port}`;
  const think = script.config.defaults.think;
  delete script.config.defaults;
  script.config.http = { defaults: { think } };

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();
      t.ok(Object.keys(report.errors).length === 0, 'no errors');
      t.ok(Object.keys(report.codes).length === 0, 'stats should be empty');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});
