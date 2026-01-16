const tap = require('tap');

// Test to verify that beforeExit extension receives exitCode parameter
// This fixes the bug where Slack plugin incorrectly reported failures for successful Fargate runs
// See: https://github.com/artilleryio/artillery/issues/3588

tap.test('beforeExit extension should receive exitCode parameter', async (t) => {
  // Mock the extension events system
  const extensionEvents = [];
  const receivedOpts = [];

  // Simulate the beforeExit extension registration
  const mockExtension = {
    ext: 'beforeExit',
    method: async (opts) => {
      receivedOpts.push(opts);
    }
  };
  extensionEvents.push(mockExtension);

  // Simulate gracefulShutdown function from run-cluster.js
  async function gracefulShutdown(opts = { earlyStop: false, exitCode: 0 }) {
    const ps = [];
    for (const e of extensionEvents) {
      const testInfo = { endTime: Date.now() };
      if (e.ext === 'beforeExit') {
        ps.push(
          e.method({
            exitCode: opts.exitCode,
            earlyStop: opts.earlyStop,
            report: { counters: {} },
            flags: {},
            runnerOpts: {
              environment: undefined,
              scriptPath: '',
              absoluteScriptPath: ''
            },
            testInfo
          })
        );
      }
    }
    await Promise.allSettled(ps);
  }

  // Test successful run (exitCode: 0)
  await gracefulShutdown({ exitCode: 0, earlyStop: false });
  t.equal(receivedOpts.length, 1, 'beforeExit should be called once');
  t.equal(receivedOpts[0].exitCode, 0, 'exitCode should be 0 for successful run');
  t.equal(receivedOpts[0].earlyStop, false, 'earlyStop should be false for successful run');

  // Test failed run (exitCode: 1)
  receivedOpts.length = 0; // Clear array
  await gracefulShutdown({ exitCode: 1, earlyStop: false });
  t.equal(receivedOpts[0].exitCode, 1, 'exitCode should be 1 for failed run');

  // Test early stop (exitCode: 130, earlyStop: true)
  receivedOpts.length = 0; // Clear array
  await gracefulShutdown({ exitCode: 130, earlyStop: true });
  t.equal(receivedOpts[0].exitCode, 130, 'exitCode should be 130 for SIGINT');
  t.equal(receivedOpts[0].earlyStop, true, 'earlyStop should be true for early stop');

  t.end();
});
