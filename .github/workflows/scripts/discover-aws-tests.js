const fs = require('fs');
const path = require('path');

/**
 * This script is used to discover all the tests in different test directories that match a specific suffix
 * and generate a JSON file that can be used to run the tests in parallel leveraging Github Actions
 */

const testLocations = [
  //   {
  //     location: 'test/cloud-e2e/fargate',
  //     package: 'artillery',
  //     suffix: '.test.js'
  //   },
  //   {
  //     location: 'test/cloud-e2e/lambda',
  //     package: 'artillery',
  //     suffix: '.test.js'
  //   },
  //   {
  //     location: 'test',
  //     package: 'artillery-engine-playwright',
  //     suffix: '.aws.js'
  //   }
  {
    location: 'test/cli',
    package: 'artillery-engine-playwright',
    suffix: '.test.js'
  }
];

const tests = {
  names: [],
  namesToFiles: {}
};

const addTest = (fileName, location, packageName, suffix) => {
  if (!fileName.endsWith(suffix)) {
    return;
  }
  const testName = fileName.replace(suffix, '');
  const jobName = `${packageName}/${testName}`;
  tests.names.push(jobName);
  tests.namesToFiles[jobName] = {
    file: `${location}/${fileName}`,
    package: packageName
  };
};

// Recursively scan a directory and add tests to the tests object
function scanDirectory(location, packageName, suffix) {
  fs.readdirSync(location).forEach((file) => {
    const absolute = path.join(location, file);
    if (fs.statSync(absolute).isDirectory()) {
      scanDirectory(absolute, packageName, suffix); // Assume packageName is passed or determined some other way
    } else {
      addTest(file, location, packageName, suffix);
    }
  });
}

// Scan all the test locations
for (const { package, location, suffix } of testLocations) {
  const fullLocation = `packages/${package}/${location}`;
  scanDirectory(fullLocation, package, suffix);
}

// Output the tests object as a JSON string to be used by Github Actions
console.log(JSON.stringify(tests));
