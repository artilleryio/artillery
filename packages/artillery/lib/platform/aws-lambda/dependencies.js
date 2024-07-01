const fs = require('fs-extra');
const AWS = require('aws-sdk');
const debug = require('debug')('platform:aws-lambda');
const Table = require('cli-table3');
const { promisify } = require('node:util');
const { createBOM } = require('../aws-ecs/legacy/bom');

const _createLambdaBom = async (
  absoluteScriptPath,
  absoluteConfigPath,
  flags
) => {
  let createBomOpts = {};
  let entryPoint = absoluteScriptPath;
  let extraFiles = [];
  createBomOpts.scenarioPath = absoluteScriptPath;
  if (absoluteConfigPath) {
    entryPoint = absoluteConfigPath;
    extraFiles.push(absoluteScriptPath);
    createBomOpts.entryPointIsConfig = true;
  }
  // TODO: custom package.json path here
  if (flags) {
    createBomOpts.flags = flags;
  }

  const bom = await promisify(createBOM)(entryPoint, extraFiles, createBomOpts);

  return bom;
};

async function _uploadFileToS3(item, testRunId, bucketName) {
  const s3 = new AWS.S3();
  const prefix = `tests/${testRunId}`;
  let body;
  try {
    body = fs.readFileSync(item.orig);
  } catch (fsErr) {
    console.log(fsErr);
  }

  if (!body) {
    return;
  }

  const key = prefix + '/' + item.noPrefixPosix;

  try {
    await s3
      .putObject({
        Bucket: bucketName,
        Key: key,
        // TODO: stream, not readFileSync
        Body: body
      })
      .promise();

    debug(`Uploaded ${key}`);
    return;
  } catch (err) {
    throw err;
  }
}

async function _syncS3(bomManifest, testRunId, bucketName) {
  const metadata = {
    createdOn: Date.now(),
    name: testRunId,
    modules: bomManifest.modules
  };

  //TODO: parallelise this
  let fileCount = 0;
  for (const file of bomManifest.files) {
    await _uploadFileToS3(file, testRunId, bucketName);
    fileCount++;
  }
  metadata.fileCount = fileCount;

  const plainS3 = new AWS.S3();
  const prefix = `tests/${testRunId}`;

  //TODO: add writeTestMetadata with configPath and newScriptPath if needed
  try {
    const key = prefix + '/metadata.json';
    await plainS3
      .putObject({
        Bucket: bucketName,
        Key: key,
        // TODO: stream, not readFileSync
        Body: JSON.stringify(metadata)
      })
      .promise();

    debug(`Uploaded ${key}`);
    return `s3://${bucketName}/${key}`;
  } catch (err) {
    //TODO: retry if needed
    throw err;
  }
}

const createAndUploadTestDependencies = async (
  bucketName,
  testRunId,
  absoluteScriptPath,
  absoluteConfigPath,
  flags
) => {
  const bom = await _createLambdaBom(
    absoluteScriptPath,
    absoluteConfigPath,
    flags
  );
  artillery.log('Test bundle contents:');
  const t = new Table({ head: ['Name', 'Type', 'Notes'] });
  for (const f of bom.files) {
    t.push([f.noPrefix, 'file']);
  }
  for (const m of bom.modules) {
    t.push([
      m,
      'package',
      bom.pkgDeps.indexOf(m) === -1 ? 'not in package.json' : ''
    ]);
  }
  //TODO: add dotenv file if specified
  artillery.log(t.toString());
  artillery.log();
  const s3Path = await _syncS3(bom, testRunId, bucketName);

  return {
    bom,
    s3Path
  };
};

module.exports = {
  createAndUploadTestDependencies
};
