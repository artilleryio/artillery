const AWS = require('aws-sdk');
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
    //TODO: use aws s3 sync with child process
    console.log('Syncing test data');
    const LOCAL_TEST_DATA_PATH = `/tmp/test_data/${testRunId}`;
  
    const s3 = new AWS.S3();
    const params = {
      Bucket: bucketName,
      Prefix: `tests/${testRunId}`
    };
    const data = await s3.listObjectsV2(params).promise();
  
    if (!fs.existsSync(LOCAL_TEST_DATA_PATH)) {
      fs.mkdirSync(LOCAL_TEST_DATA_PATH, { recursive: true })
    }
  
    //TODO : review why I didn't use s3 sync here? I think it was because aws cli wasnt available in the env at the time
    for (const file of data.Contents) {
      const params = {
        Bucket: bucketName,
        Key: file.Key
      };
      const data = await s3.getObject(params).promise();
      const pathFile = path.basename(file.Key);

      fs.writeFileSync(`${LOCAL_TEST_DATA_PATH}/${pathFile}`, data.Body);
    }
  
    for (const file of fs.readdirSync(LOCAL_TEST_DATA_PATH)) {
      console.log(file);
    }
    console.log('Test data synced');
  };
  
  const installNpmDependencies = async (testDataLocation) => {
    console.log(`Changing directory to ${testDataLocation}`)
    process.chdir(testDataLocation);
  
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