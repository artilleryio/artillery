const tap = require('tap');
const { execute, deleteFile, getRootPath } = require('../cli/_helpers.js');
const fs = require('fs');
const path = require('path');
const execa = require('execa');

tap.test('Run a simple script', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--config',
    './test/scripts/hello_config.json',
    'test/scripts/hello.json'
  ]);

  t.ok(exitCode === 0 && output.stdout.includes('Summary report'));
});

tap.test(
  'Exits with error before test run if dir specified with -o is nonexistent',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      '--config',
      './test/scripts/hello_config.json',
      'test/scripts/hello.json',
      '-o',
      'totally/bogus/path'
    ]);
    t.ok(exitCode !== 0 && output.includes('Path does not exist'));
  }
);

tap.test(
  'Running with no target and no -e should exit with an error',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/environments.yaml'
    ]);

    t.ok(exitCode !== 0 && output.includes('No target specified'));
  }
);

tap.test('Environment specified with -e should be used', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '-e',
    'production',
    'test/scripts/environments2.json'
  ]);

  // Here if the right environment is not picked up, we'll get ECONNREFUSED errors in the report
  t.ok(exitCode === 0 && !output.stdout.includes('ECONNREFUSED'));
});

tap.test('Run a script with one payload command line', async (t) => {
  const [, output] = await execute([
    'run',
    'test/scripts/single_payload.json',
    '-p',
    'test/scripts/pets.csv'
  ]);

  t.ok(output.stdout.includes('Summary report'));
});

tap.test('Run a script with one payload json config', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    'test/scripts/single_payload_object.json'
  ]);

  t.ok(exitCode === 0 && output.stdout.includes('Summary report'));
});

tap.test(
  'Run a script with one payload json config with parse options passed',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/single_payload_options.json'
    ]);

    t.ok(exitCode === 0 && output.stdout.includes('Summary report'));
  }
);

tap.test(
  'Run a script with multiple payloads and use of $environment in path',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      '--environment',
      'local',
      'test/scripts/multiple_payloads.json'
    ]);

    t.ok(exitCode === 0 && output.stdout.includes('Summary report'));
  }
);

tap.test('Run a script overwriting default options (output)', async (t) => {
  const reportFile = 'artillery_report_custom.json';
  const [exitCode, output] = await execute([
    'run',
    '--config',
    'test/scripts/hello_config.json',
    'test/scripts/hello.json',
    '-o',
    reportFile
  ]);

  t.ok(
    exitCode === 0 &&
      output.stdout.includes('Log file: artillery_report_custom.json')
  );
});

tap.test('Script using hook functions', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--config',
    'test/scripts/hello_config.json',
    'test/scripts/hello.json'
  ]);

  t.ok(exitCode === 0 && output.stdout.includes('hello from processor'));
});

tap.test('Hook functions - can rewrite the URL', async (t) => {
  // Ref: https://github.com/shoreditch-ops/artillery/issues/185
  const reportFile = 'report-hook.json';
  const reportFilePath = await getRootPath(reportFile);
  const [exitCode] = await execute([
    'run',
    '--config',
    'test/scripts/hello_config.json',
    'test/scripts/hello.json',
    '-o',
    reportFile
  ]);
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.ok(
    deleteFile(reportFilePath) &&
      exitCode === 0 &&
      json.aggregate.counters['http.codes.200']
  );
});

tap.test('Environment variables can be loaded from dotenv files', async (t) => {
  const reportFile = 'report-with-dotenv.json';
  const reportFilePath = await getRootPath(reportFile);
  const [exitCode] = await execute([
    'run',
    '--dotenv',
    'test/scripts/with-dotenv/my-vars',
    'test/scripts/with-dotenv/with-dotenv.yml',
    '-o',
    reportFile
  ]);
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.ok(
    deleteFile(reportFilePath) &&
      exitCode === 0 &&
      json.aggregate.counters['http.codes.200']
  );
});

tap.test('Script using a plugin', async (t) => {
  const abortController = new AbortController();
  // a target is needed for the plugin to output properly
  execa('node', ['./test/targets/gh_215_target.js'], {
    signal: abortController.signal
  });

  const reportFile = 'report-with-plugin.json';
  const reportFilePath = await getRootPath(reportFile);
  const pluginFile = 'plugin-data.csv';
  const pluginFilePath = await getRootPath(pluginFile);

  const pluginPath = path.resolve(__dirname, '..', 'plugins');

  const [exitCode] = await execute(
    ['run', '--output', reportFile, 'test/scripts/hello_plugin.json'],
    { env: { ARTILLERY_PLUGIN_PATH: pluginPath } }
  );
  abortController.abort();

  const reportCount = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
    .aggregate.counters['http.requests'];
  const pluginCount = Number(fs.readFileSync(pluginFilePath, 'utf8'));

  t.ok(
    deleteFile(reportFilePath) &&
      deleteFile(pluginFilePath) &&
      exitCode === 0 &&
      reportCount === pluginCount
  );
});

tap.test(
  'The --overrides option may be used to change the script',
  async (t) => {
    const reportFile = 'report-with-override.json';
    const reportFilePath = await getRootPath(reportFile);

    const [exitCode] = await execute(
      [
        'run',
        '-e',
        'dev',
        '--overrides',
        '{"config": {"environments": {"dev":{"target":"http://localhost:3003"}}, "phases": [{"arrivalCount": 1, "duration": 1}]}}',
        '-o',
        reportFile,
        'test/scripts/environments.yaml'
      ],
      { env: { ARTILLERY_USE_LEGACY_REPORT_FORMAT: '1' } }
    );

    const reportCount = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
      .aggregate.scenariosCreated;

    t.ok(deleteFile(reportFilePath) && exitCode === 0 && reportCount === 1);
  }
);

tap.test(
  'The value provided with --overrides must be valid JSON',
  async (t) => {
    const [exitCode] = await execute([
      'run',
      '-e',
      'local',
      '--overrides',
      '{config: {}}',
      'test/scripts.environments.yaml'
    ]);

    t.ok(exitCode === 1);
  }
);

tap.test(
  'Ramp to script throughput behaves as expected running on multiple workers',
  async (t) => {
    // This would cause older versions of artillery to generate much more traffic than expected
    // We compare them to the max amount of arrivals we expect from the script # Note: v2.0.0-22 generates 20+ arrivals, almost double
    const totalRequests = 7;

    const reportMultipleFile = 'multiple_workers.json';
    const reportMultipleFilePath = await getRootPath(reportMultipleFile);

    const reportSingleFile = 'single_worker.json';
    const reportSingleFilePath = await getRootPath(reportSingleFile);

    const [exitCodeMultiple] = await execute([
      'run',
      '-o',
      reportMultipleFile,
      'test/scripts/ramp.json'],
      { env: { WORKERS: 7 } }
    );
    const [exitCodeSingle] = await execute(
      ['run', '-o', reportSingleFile, 'test/scripts/ramp.json'],
      { env: { WORKERS: 1 } }
    );

    const multipleCount = JSON.parse(
      fs.readFileSync(reportMultipleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];
    const singleCount = JSON.parse(
      fs.readFileSync(reportSingleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];
    t.ok(
      deleteFile(reportMultipleFilePath) &&
        deleteFile(reportSingleFilePath) &&
        exitCodeMultiple === 0 &&
        exitCodeSingle === 0 &&
        multipleCount === totalRequests &&
        singleCount === totalRequests
    );
  }
);

tap.test(
  'Ramp to script throughput behaves as expected running on multiple workers 1s duration',
  async (t) => {
    // amount of workers was still affecting ramps with duration = 1s
    // check single worker and multiple workers now generate same throughput
    const totalRequests = 10;

    const reportMultipleFile = 'multiple_workers.json';
    const reportMultipleFilePath = await getRootPath(reportMultipleFile);

    const reportSingleFile = 'single_worker.json';
    const reportSingleFilePath = await getRootPath(reportSingleFile);

    const [exitCodeMultiple] = await execute([
      'run',
      '-o',
      reportMultipleFile,
      'test/scripts/ramp-regression-1682.json'],
      { env: { WORKERS: 7 } }
    );
    const [exitCodeSingle] = await execute(
      ['run', '-o', reportSingleFile, 'test/scripts/ramp-regression-1682.json'],
      { env: { WORKERS: 1 } }
    );

    const multipleCount = JSON.parse(
      fs.readFileSync(reportMultipleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];
    const singleCount = JSON.parse(
      fs.readFileSync(reportSingleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];
    t.ok(
      deleteFile(reportMultipleFilePath) &&
        deleteFile(reportSingleFilePath) &&
        exitCodeMultiple === 0 &&
        exitCodeSingle === 0 &&
        multipleCount === totalRequests &&
        singleCount === totalRequests
    );
  }
);

tap.test(
  'Ramp to script throughput behaves as expected running on multiple workers',
  async (t) => {
    // Ramp to 2.0.0-24 regression #1682
    // This would cause older versions of artillery to use Infinity as tick duration
    // causing a worker to break and log:
    // `TimeoutOverflowWarning: Infinity does not fit into a 32-bit signed integer.
    // Timeout duration was set to 1.`
    // This happened because for a certain phase a worker had arrivalRate==rampTo==0

    const [exitCode, output] = await execute(
      ['run', 'test/scripts/ramp-regression-1682.json'],
      { env: { WORKERS: 7 } }
    );

    t.ok(exitCode === 0 && output.stdout.includes('Summary report'));
  }
);
