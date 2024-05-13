const tap = require('tap');
const {
  execute,
  deleteFile,
  getRootPath,
  returnTmpPath,
  generateTmpReportPath
} = require('../cli/_helpers.js');
const fs = require('fs');
const path = require('path');
const execa = require('execa');

let reportFilePath;
tap.beforeEach(async (t) => {
  reportFilePath = generateTmpReportPath(t.name, 'json');
});

tap.test('Run a simple script', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--config',
    './test/scripts/hello_config.json',
    'test/scripts/hello.json'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(output.stdout.includes('Summary report'), 'Should log Summary report');
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

    t.not(exitCode, 0, 'CLI should exit with error code (non-zero)');
    t.ok(output.stderr.includes('Path does not exist'), 'Should log error');
  }
);

tap.test(
  'Running with no target and no -e should exit with an error',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/environments.yaml'
    ]);

    t.not(exitCode, 0, 'CLI should exit with error code (non-zero)');
    t.ok(output.stderr.includes('No target specified'), 'Should log error');
  }
);

tap.test(
  'Run a script with config/processor in different folders and processor resolved relative to scenario (backwards compatibility)',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/scenario-config-different-folder/scenario.yml',
      '--config',
      'test/scripts/scenario-config-different-folder/config/config-processor-backward-compatibility.yml'
    ]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(
      output.stdout.includes('Successfully ran with id myTestId123'),
      'Should log success'
    );
  }
);

tap.test(
  'Run a script with config/processor in different folders and processor resolved relative to config',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/scenario-config-different-folder/scenario.yml',
      '--config',
      'test/scripts/scenario-config-different-folder/config/config.yml'
    ]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(
      output.stdout.includes('Successfully ran with id myTestId123'),
      'Should log success'
    );
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
  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.notOk(
    output.stdout.includes('ECONNREFUSED'),
    'Should not have connection refused errors'
  );
});

tap.test('Can specify scenario to run by name', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--scenario-name',
    'Test Scenario 2',
    '-o',
    `${reportFilePath}`,
    'test/scripts/scenario-named/scenario.yml'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('Successfully running scenario 2'),
    'Should log success'
  );
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(
    json.aggregate.counters['vusers.created_by_name.Test Scenario 2'],
    6,
    'Should have created 6 vusers for the right scenario'
  );
  t.type(
    json.aggregate.counters['vusers.created_by_name.Test Scenario 1'],
    'undefined',
    'Should not have created vusers for the wrong scenario'
  );
});

tap.test('Can specify scenario to run by name', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--scenario-name',
    'Test Scenario (4)',
    '-o',
    `${reportFilePath}`,
    'test/scripts/scenario-named/scenario.yml'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('Successfully running scenario 4'),
    'Should log success'
  );
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(
    json.aggregate.counters['vusers.created_by_name.Test Scenario (4)'],
    6,
    'Should have created 6 vusers for the right scenario'
  );
  t.type(
    json.aggregate.counters['vusers.created_by_name.Test Scenario 1'],
    'undefined',
    'Should not have created vusers for the wrong scenario'
  );
});

tap.test(
  'Errors correctly when specifying a non-existing scenario by name',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      '--scenario-name',
      'Test Scenario 5',
      'test/scripts/scenario-named/scenario.yml'
    ]);

    t.equal(exitCode, 11);
    t.ok(
      output.stdout.includes(
        'Error: Scenario Test Scenario 5 not found in script. Make sure your chosen scenario matches the one in your script exactly.'
      ),
      'Should log error when scenario not found'
    );
  }
);

tap.test('Run a script with one payload command line', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    'test/scripts/single_payload.json',
    '-p',
    'test/scripts/pets.csv'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(output.stdout.includes('Summary report'), 'Should log Summary report');
});

tap.test('Run a script with one payload json config', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    'test/scripts/single_payload_object.json'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(output.stdout.includes('Summary report'), 'Should log Summary report');
});

tap.test(
  'Run a script with one payload json config with parse options passed',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/single_payload_options.json'
    ]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(output.stdout.includes('Summary report'), 'Should log Summary report');
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

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(output.stdout.includes('Summary report'), 'Should log Summary report');
  }
);

tap.test(
  'Loads metrics-by-endpoint plugin by default, with output supressed',
  async (t) => {
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/hello.json',
      '--config',
      './test/scripts/hello_config.json',
      '-o',
      `${reportFilePath}`
    ]);

    const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));
    const pluginPrefix = 'plugins.metrics-by-endpoint';

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(!output.stdout.includes(pluginPrefix), 'Should not log plugin output');
    t.ok(
      Object.keys(json.aggregate.counters).some((key) =>
        key.includes(pluginPrefix)
      ),
      'Should have plugin counters in report'
    );
    t.ok(
      Object.keys(json.aggregate.summaries).some((key) =>
        key.includes(pluginPrefix)
      ),
      'Should have plugin summaries in report'
    );
  }
);

tap.test('Run a script overwriting default options (output)', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--config',
    'test/scripts/hello_config.json',
    'test/scripts/hello.json',
    '-o',
    reportFilePath
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes(`Log file: ${reportFilePath}`),
    'Should log output file'
  );
});

tap.test(
  'Run a script with overwriting variables in config with cli variables',
  async (t) => {
    const variableOverride = {
      bar: 'this is me',
      myVar: 3
    };
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/scenario-cli-variables/scenario-with-variables.yml',
      '--variables',
      JSON.stringify(variableOverride)
    ]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(
      output.stdout.includes(`foo is ${variableOverride.myVar}`),
      'Templated foo nested config variable is not showing'
    );
    t.ok(
      output.stdout.includes(`other is ${variableOverride.myVar}`),
      'other variable from config variable not showing'
    );
    t.ok(
      output.stdout.includes(`bar is ${variableOverride.bar}`),
      'bar variable from --variables not showing'
    );
    t.ok(
      output.stdout.includes(`myVar is ${variableOverride.myVar}`),
      'myVar variable from --variables not showing'
    );
  }
);

tap.test(
  'Run a script with overwriting variables in other nested config with cli variables',
  async (t) => {
    const variableOverride = {
      myVar: 3,
      defaultCookie: 'abc123',
      anotherCookie: 'hellothere'
    };
    const [exitCode, output] = await execute([
      'run',
      'test/scripts/scenario-cli-variables/scenario-with-other-nested-config.yml',
      '--variables',
      JSON.stringify(variableOverride)
    ]);

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(
      output.stdout.includes(`other is ${variableOverride.myVar}`),
      'other variable from config variable not showing'
    );
    t.ok(
      output.stdout.includes(`HTTP timeout is: ${variableOverride.myVar}`),
      'Templated variable in other nested config (http) is not showing'
    );
    t.ok(
      output.stdout.includes('Has default cookie: true'),
      'Templated variable in other nested config (cookie) is not showing'
    );
    t.ok(
      output.stdout.includes('Has cookie from flow: true'),
      'Templated variable in nested scenario option is not showing'
    );
  }
);

tap.test('Script using hook functions', async (t) => {
  const [exitCode, output] = await execute([
    'run',
    '--config',
    'test/scripts/hello_config.json',
    'test/scripts/hello.json'
  ]);

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    output.stdout.includes('hello from processor'),
    'Should log processor output'
  );
});

//TODO: review these 2 test assertions
tap.test('Hook functions - can rewrite the URL', async (t) => {
  // Ref: https://github.com/shoreditch-ops/artillery/issues/185
  const [exitCode] = await execute([
    'run',
    '--config',
    'test/scripts/hello_config.json',
    'test/scripts/hello.json',
    '-o',
    reportFilePath
  ]);
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.equal(
    json.aggregate.counters['http.codes.200'],
    3,
    'Should have 3 successful 200 requests'
  );
});

tap.test('Environment variables can be loaded from dotenv files', async (t) => {
  const [exitCode] = await execute([
    'run',
    '--dotenv',
    'test/scripts/with-dotenv/my-vars',
    'test/scripts/with-dotenv/with-dotenv.yml',
    '-o',
    reportFilePath
  ]);
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.equal(
    json.aggregate.counters['http.codes.200'],
    1,
    'Should have 1 successful 200 requests'
  );
});

tap.test('Environment variables can be loaded using $env', async (t) => {
  // test uses these variables (with $env) in scenarios, and in config (nested and root-level)
  const variables = {
    URL: 'http://asciiart.artillery.io:8080/',
    ENVIRONMENT: 'testing',
    ARRIVAL_RATE: 2,
    NESTED_HEADER_VALUE: 'abc123'
  };

  const [exitCode, result] = await execute(
    ['run', 'test/scripts/with-process-env/with-env.yml', '-o', reportFilePath],
    { env: { ...variables } }
  );
  const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.equal(
    json.aggregate.counters['http.codes.200'],
    2,
    'Should have 2 successful 200 requests'
  );
  t.ok(
    result.stdout.includes(`Environment is ${variables.ENVIRONMENT}`),
    'Should log environment variable from processor func'
  );
  t.ok(
    result.stdout.includes(`Header is ${variables.NESTED_HEADER_VALUE}`),
    'Should log header variable from processor func'
  );
});

tap.test(
  'Environment variables can be loaded using legacy $processEnvironment',
  async (t) => {
    // test uses these variables (with $processEnvironment) in scenarios, and in config (nested and root-level)
    const variables = {
      URL: 'http://asciiart.artillery.io:8080/',
      ENVIRONMENT: 'testing',
      ARRIVAL_RATE: 2,
      NESTED_HEADER_VALUE: 'abc123'
    };

    const [exitCode, result] = await execute(
      [
        'run',
        'test/scripts/with-process-env/with-processEnvironment.yml',
        '-o',
        reportFilePath
      ],
      { env: { ...variables } }
    );
    const json = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.equal(
      json.aggregate.counters['http.codes.200'],
      2,
      'Should have 2 successful 200 requests'
    );
    t.ok(
      result.stdout.includes(`Environment is ${variables.ENVIRONMENT}`),
      'Should log environment variable from processor func'
    );
    t.ok(
      result.stdout.includes(`Header is ${variables.NESTED_HEADER_VALUE}`),
      'Should log header variable from processor func'
    );
  }
);

tap.test('Script using a plugin', async (t) => {
  const abortController = new AbortController();
  // a target is needed for the plugin to output properly
  execa('node', ['./test/targets/gh_215_target.js'], {
    signal: abortController.signal
  });

  const pluginFile = 'plugin-data.csv';
  const pluginFilePath = await getRootPath(pluginFile);

  const pluginPath = path.resolve(__dirname, '..', 'plugins');

  const [exitCode] = await execute(
    ['run', '--output', reportFilePath, 'test/scripts/hello_plugin.json'],
    { env: { ARTILLERY_PLUGIN_PATH: pluginPath } }
  );
  abortController.abort();

  const reportCount = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
    .aggregate.counters['http.requests'];
  const pluginCount = Number(fs.readFileSync(pluginFilePath, 'utf8'));

  t.ok(deleteFile(pluginFilePath));
  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.equal(
    reportCount,
    pluginCount,
    'Should have same number of requests in report as plugin'
  );
});

tap.test(
  'The --overrides option may be used to change the script',
  async (t) => {
    const [exitCode] = await execute(
      [
        'run',
        '-e',
        'dev',
        '--overrides',
        '{"config": {"environments": {"dev":{"target":"http://localhost:3003"}}, "phases": [{"arrivalCount": 1, "duration": 1}]}}',
        '-o',
        reportFilePath,
        'test/scripts/environments.yaml'
      ],
      { env: { ARTILLERY_USE_LEGACY_REPORT_FORMAT: '1' } }
    );

    const reportCount = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'))
      .aggregate.scenariosCreated;

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.equal(reportCount, 1, 'Should have created 1 scenario');
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

    t.equal(exitCode, 1, 'CLI should error with code 1');
  }
);

tap.test(
  'Ramp to script throughput behaves as expected running on multiple workers vs single worker',
  async (t) => {
    // This would cause older versions of artillery to generate much more traffic than expected
    // We compare them to the max amount of arrivals we expect from the script # Note: v2.0.0-22 generates 20+ arrivals, almost double
    const totalRequests = 7;

    const reportMultipleFilePath = returnTmpPath(
      `multiple_workers-${Date.now()}.json`
    );
    const reportSingleFilePath = returnTmpPath(
      `single_worker-${Date.now()}.json`
    );

    const [exitCodeMultiple] = await execute(
      ['run', '-o', reportMultipleFilePath, 'test/scripts/ramp.json'],
      { env: { WORKERS: 7 } }
    );
    const [exitCodeSingle] = await execute(
      ['run', '-o', reportSingleFilePath, 'test/scripts/ramp.json'],
      { env: { WORKERS: 1 } }
    );

    const multipleCount = JSON.parse(
      fs.readFileSync(reportMultipleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];
    const singleCount = JSON.parse(
      fs.readFileSync(reportSingleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];

    t.equal(exitCodeMultiple, 0, 'CLI should exit with code 0');
    t.equal(exitCodeSingle, 0, 'CLI should exit with code 0');
    t.equal(
      multipleCount,
      totalRequests,
      `Should have created ${totalRequests} scenarios`
    );
    t.equal(
      singleCount,
      totalRequests,
      `Should have created ${totalRequests} scenarios`
    );
  }
);

tap.test(
  'Ramp to script throughput behaves as expected running on multiple workers vs single worker (1s duration)',
  async (t) => {
    // amount of workers was still affecting ramps with duration = 1s
    // check single worker and multiple workers now generate same throughput
    const totalRequests = 10;

    const reportMultipleFilePath = returnTmpPath(
      `multiple_workers-${Date.now()}.json`
    );
    const reportSingleFilePath = returnTmpPath(
      `single_worker-${Date.now()}.json`
    );

    const [exitCodeMultiple] = await execute(
      [
        'run',
        '-o',
        reportMultipleFilePath,
        'test/scripts/ramp-regression-1682.json'
      ],
      { env: { WORKERS: 7 } }
    );
    const [exitCodeSingle] = await execute(
      [
        'run',
        '-o',
        reportSingleFilePath,
        'test/scripts/ramp-regression-1682.json'
      ],
      { env: { WORKERS: 1 } }
    );

    const multipleCount = JSON.parse(
      fs.readFileSync(reportMultipleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];
    const singleCount = JSON.parse(
      fs.readFileSync(reportSingleFilePath, 'utf8')
    ).aggregate.counters['vusers.created'];

    t.equal(exitCodeMultiple, 0, 'CLI should exit with code 0');
    t.equal(exitCodeSingle, 0, 'CLI should exit with code 0');
    t.equal(
      multipleCount,
      totalRequests,
      `Should have created ${totalRequests} scenarios`
    );
    t.equal(
      singleCount,
      totalRequests,
      `Should have created ${totalRequests} scenarios`
    );
  }
);

tap.test(
  'Ramp to script throughput behaves as expected running on multiple workers (1s duration)',
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

    t.equal(exitCode, 0, 'CLI should exit with code 0');
    t.ok(output.stdout.includes('Summary report'), 'Should log Summary report');
  }
);

tap.test("Script with 'parallel' behaves as expected", async (t) => {
  const expectedVus = 2;
  const expectedRequests = 6; // 1 scenario * 3 requests * 2 VUs
  const requestNames = ['Dinosaur', 'Pony', 'Armadillo'];
  const [exitCode, output] = await execute([
    'run',
    'test/scripts/scenario-with-parallel/scenario.yml',
    '-o',
    `${reportFilePath}`
  ]);

  const report = JSON.parse(fs.readFileSync(reportFilePath, 'utf8'));

  t.equal(exitCode, 0, 'CLI should exit with code 0');
  t.ok(
    !output.stdout.includes('false'),
    'Request uuid available in request hooks should be correctly mapped to requests'
  );
  for (const name of requestNames) {
    t.equal(
      report.aggregate.counters[`beforeRequestHook.${name}`],
      expectedVus,
      `Should have created ${expectedVus} requests for ${name} request`
    );
    t.equal(
      report.aggregate.counters[`afterRequestHook.${name}`],
      expectedVus,
      `AfterRequest hook should of ran ${expectedVus} times for ${name} request`
    );
  }

  t.equal(
    report.aggregate.counters['vusers.created'],
    expectedVus,
    `Should have created ${expectedVus} scenarios`
  );
  t.equal(
    report.aggregate.counters['vusers.completed'],
    expectedVus,
    'All VUs should have succeeded'
  );
  t.equal(
    report.aggregate.counters['http.requests'],
    expectedRequests,
    `Should have made ${expectedRequests} requests`
  );
  t.equal(
    report.aggregate.counters['http.codes.200'],
    expectedRequests,
    `Should have made ${expectedRequests} successful requests`
  );
  deleteFile(reportFilePath);
});
