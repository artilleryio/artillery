const { promisify } = require('node:util');
const { createBOM } = require('../../create-bom/create-bom');
const createS3Client = require('../aws-ecs/legacy/create-s3-client');
const debug = require('debug')('aws:lambda');
const Table = require('cli-table3');
const fs = require('fs');

//TODO: unify BOM's
const prepareManifest = async (absoluteScriptPath, absoluteConfigPath) => {
  let createBomOpts = {};
  let entryPoint = absoluteScriptPath;
  let extraFiles = [];
  if (absoluteConfigPath) {
    entryPoint = absoluteConfigPath;
    extraFiles.push(absoluteScriptPath);
    createBomOpts.entryPointIsConfig = true;
  }
  // TODO: custom package.json path here

  // artillery.log('- Bundling test data');
  const bom = await promisify(createBOM)(entryPoint, extraFiles, createBomOpts);

  return bom;
};

const prettyPrintManifest = (bomManifest) => {
  artillery.logger({ showTimestamp: true }).log('Test bundle prepared...');
  artillery.log('Test bundle contents:');
  const t = new Table({ head: ['Name', 'Type', 'Notes'] });
  for (const f of bomManifest.files) {
    t.push([f.noPrefix, 'file']);
  }
  for (const m of bomManifest.modules) {
    t.push([
      m,
      'package',
      bomManifest.pkgDeps.indexOf(m) === -1 ? 'not in package.json' : ''
    ]);
  }
  artillery.log(t.toString());
  artillery.log();
};

async function uploadFileToS3(item, testRunId, bucketName) {
  const plainS3 = createS3Client();
  const prefix = `tests/${testRunId}`;
  // If we can't read the file, it may have been specified with a
  // template in its name, e.g. a payload file like:
  // {{ $environment }}-users.csv
  // If so, ignore it, hope config.includeFiles was used, and let
  // "artillery run" in the worker deal with it.
  let body;
  try {
    body = fs.readFileSync(item.orig);
  } catch (fsErr) {
    console.log(fsErr);
  }

  if (!body) {
    return;
  }

  const key = prefix + '/' + item.noPrefix;

  try {
    await plainS3.putObject({
      Bucket: bucketName,
      Key: key,
      // TODO: stream, not readFileSync
      Body: body
    }).promise();

    console.log(`Uploaded ${key}`);
    return;
  } catch (err) {
    //TODO: retry if needed
    console.log(err);
    return;
  }
}

async function syncS3(bomManifest, testRunId, bucketName) {
  const metadata = {
    createdOn: Date.now(),
    name: testRunId,
    modules: bomManifest.modules
  };

  //TODO: parallelise this
  let fileCount = 0;
  for (const file of bomManifest.files) { 
    await uploadFileToS3(file, testRunId, bucketName);
    fileCount++;
  }
  metadata.fileCount = fileCount;

  const plainS3 = createS3Client();
  const prefix = `tests/${testRunId}`;


  //TODO: add writeTestMetadata with configPath and newScriptPath if needed
  try {
    const key = prefix + '/metadata.json';
    await plainS3.putObject({
      Bucket: bucketName,
      Key: key,
      // TODO: stream, not readFileSync
      Body: JSON.stringify(metadata)
    }).promise();

    console.log(`Uploaded ${key}`);
    return;
  } catch (err) {
    //TODO: retry if needed
    debug(err);
    return;
  }

}

const createTest = async (
  absoluteScriptPath,
  absoluteConfigPath,
  testRunId,
  bucketName
) => {
  const bom = await prepareManifest(absoluteScriptPath, absoluteConfigPath);

  prettyPrintManifest(bom);
  
  await syncS3(bom, testRunId, bucketName);

  return bom;
};

module.exports = {
  createTest
};
