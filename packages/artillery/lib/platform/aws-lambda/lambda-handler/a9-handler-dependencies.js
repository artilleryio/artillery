const fs = require('fs');
const path = require('path');
const { runProcess } = require('./a9-handler-helpers');

const syncTestData = async (bucketName, testRunId) => {
  console.log('Syncing test data');
  const LOCAL_TEST_DATA_PATH = `/tmp/test_data/${testRunId}`;
  const REMOTE_TEST_DATA_PATH = `s3://${bucketName}/tests/${testRunId}`;

  if (!fs.existsSync(LOCAL_TEST_DATA_PATH)) {
    fs.mkdirSync(LOCAL_TEST_DATA_PATH, { recursive: true });
  }

  const result = await runProcess(
    'aws',
    ['s3', 'sync', REMOTE_TEST_DATA_PATH, LOCAL_TEST_DATA_PATH],
    { log: true }
  );

  if (result.code != 0 || result.stderr) {
    throw new Error(`Failed to sync test data:\n ${result.stderr}`);
  }
  console.log('Test data synced');
};

const installNpmDependencies = async (testDataLocation) => {
  //TODO: handle npmrc (i.e. artifactory, etc)
  console.log(`Changing directory to ${testDataLocation}`);
  process.chdir(testDataLocation);

  const metadataJson = fs.readFileSync(
    path.join(testDataLocation, 'metadata.json')
  );

  //first, install custom dependencies
  for (const dep of JSON.parse(metadataJson).modules) {
    console.log(`Installing ${dep}`);
    await runProcess('npm', ['install', dep, '--prefix', testDataLocation], {
      log: true,
      env: {
        HOME: testDataLocation
      }
    });
  }

  if (!fs.existsSync(path.join(testDataLocation, 'package.json'))) {
    await runProcess('npm', ['init', '-y', '--quiet'], {
      log: true,
      env: {
        HOME: testDataLocation
      }
    });
  }

  const installResult = await runProcess(
    'npm',
    ['install', '--prefix', testDataLocation],
    {
      log: true,
      env: {
        HOME: testDataLocation
      }
    }
  );

  console.log(installResult);
  console.log('Finished installing test data');
};

module.exports = {
  syncTestData,
  installNpmDependencies
};
