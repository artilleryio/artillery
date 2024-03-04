//find all test paths in given locations
//e.g. packages/artillery/test/cloud-e2e/
//would find /fargate/run-fargate.test.js and /lambda/run-lambda.test.js
//using only core node modules

const fs = require('fs');
const path = require('path');

const testLocations = [
  // {
  //     package: 'artillery',
  //     location: 'test/cloud-e2e/fargate'
  // },
  // {
  //     package: 'artillery',
  //     location: 'test/cloud-e2e/lambda'
  // },
  // {
  //     package: 'artillery-engine-playwright',
  //     location: 'test/fargate.aws.js'
  // }
  {
    package: 'artillery',
    location: 'test/cli'
  }
];

const tests = {
  names: [],
  namesToFiles: {}
};
//tests files are *.test.js.
//we are interested in only the file name without the .test.js extension

testLocations.forEach(({ package, location }) => {
  //if location is a file, add it to the list of tests

  const fullLocation = `packages/${package}/${location}`;
  if (fs.lstatSync(fullLocation).isFile()) {
    //get filename
    const filename = path.basename(fullLocation);
    const jobName = `${package}/${filename}`;
    tests.names.push(jobName);
    tests.namesToFiles[jobName] = location;
    return;
  }

  //if location is a directory, add all files in the directory ending in .test.js to the list of tests
  const files = fs.readdirSync(fullLocation);
  files.forEach((file) => {
    if (file.endsWith('.test.js')) {
      const testName = file.replace('.test.js', '');
      const jobName = `${package}/${testName}`;
      tests.names.push(jobName);
      tests.namesToFiles[jobName] = {
        file: `${location}/${file}`,
        package: package
      };
    }
  });
});

console.log(JSON.stringify(tests));
