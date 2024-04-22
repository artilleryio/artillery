const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { runProcess } = require('./helpers');

// const syncTestData = async (bucketName, testRunId) => {
//     const REMOTE_TEST_DATA_PATH = `${bucketName}/tests/${testRunId}`

//     //use aws s3 sync with child process
//     const LOCAL_TEST_DATA_PATH = `${process.cwd()}/test_data`
    
//     const sync = spawn('aws', ['s3', 'sync', REMOTE_TEST_DATA_PATH, LOCAL_TEST_DATA_PATH]);

//     //console.log files in directory LOCAL_TEST_DATA_PATH
//     const ls = spawn('ls', [LOCAL_TEST_DATA_PATH]);
//     ls.stdout.on('data', (data) => {
//         console.log(`FILES:`)
//         console.log(`stdout: ${data}`);
//     });
// }

// const installNpmDependencies = async (dependencies, workingDir) => { 
//     const npm = require('npm');

//     npm.commands.install()
//     // const util = require('util');
//     // const exec = util.promisify(require('child_process').exec);
    
//     // await exec(`npm install ${dependencies.join(' ')} --prefix ${workingDir}`);
// };

const syncTestData = async (bucketName, testRunId) => {
    console.log('Syncing test data');
    const LOCAL_TEST_DATA_PATH = `/tmp/test_data/${testRunId}`;

    if (!fs.existsSync(LOCAL_TEST_DATA_PATH)) {
        fs.mkdirSync(LOCAL_TEST_DATA_PATH, { recursive: true })
      }

    const result = await runProcess('aws', ['s3', 'sync', `s3://${bucketName}/tests/${testRunId}`, LOCAL_TEST_DATA_PATH], { log: true });
    console.log(result)

    //TODO: should we introduce the "leader" concept and optimise using the install of node_modules?
    //how relevant is it really? Only on larger dependency trees I suppose?

    const metadataJson = fs.readFileSync(path.join(LOCAL_TEST_DATA_PATH, 'metadata.json'), );
    const localFiles = fs.readdirSync(LOCAL_TEST_DATA_PATH);

    const metadataFileCount = JSON.parse(metadataJson).fileCount + 1 //include metadata json too;
    if (metadataFileCount != localFiles.length) { 
        throw new Error(`Number of files in metadata.json (${metadataFileCount}) does not match number of files (${localFiles.length}) in local directory! Something went wrong!`);
    }

    console.log('Test data synced');
  };
  
  const installNpmDependencies = async (testDataLocation) => {
    //TODO: handle npmrc (i.e. artifactory, etc)
    console.log(`Changing directory to ${testDataLocation}`)
    process.chdir(testDataLocation);

    const metadataJson = fs.readFileSync(path.join(testDataLocation, 'metadata.json'));

    //first, install custom dependencies
    for (const dep of JSON.parse(metadataJson).modules) { 
        console.log(`Installing ${dep}`);
        await runProcess('npm', ['install', dep, '--prefix', testDataLocation], { log: true, env: {
            HOME: testDataLocation,
        } });
    }

    if (!fs.existsSync(path.join(testDataLocation, 'package.json'))) {
      await runProcess('npm', ['init', '-y', '--quiet'], { log: true, env: {
        HOME: testDataLocation,
      } });
    }
  
    const res = await runProcess('npm', ['install', '--prefix', testDataLocation], { log: true, env: {
      HOME: testDataLocation,
    } });
  
    console.log(res)
  
    for (const file of fs.readdirSync(testDataLocation)) {
      console.log(file);
    }
  
    // process.chdir(originalDir);
    console.log(`Finished installing test data`)
  }

module.exports = {
    syncTestData,
    installNpmDependencies
}