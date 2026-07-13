
import { PutObjectCommand } from '@aws-sdk/client-s3';
import createDebug from 'debug';
import fs from 'fs-extra';

const debug = createDebug('platform:aws-lambda');

import { promisify } from 'node:util';
import Table from 'cli-table3';
import { createBOM, enrichPackageJson } from '../aws-ecs/legacy/bom.ts';
import createS3Client from '../aws-ecs/legacy/create-s3-client.ts';

const _createLambdaBom = async (
  absoluteScriptPath,
  absoluteConfigPath,
  flags
) => {
  const createBomOpts: any = {};
  let entryPoint = absoluteScriptPath;
  const extraFiles = [];
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

  const bom: any = await promisify(createBOM)(entryPoint, extraFiles, createBomOpts);

  return bom;
};

async function _uploadFileToS3(item, testRunId, bucketName, moduleVersions) {
  const s3 = createS3Client();
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

  if (item.noPrefix === 'package.json') {
    body = Buffer.from(enrichPackageJson(body.toString(), moduleVersions));
  }

  const key = `${prefix}/${item.noPrefixPosix}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        // TODO: stream, not readFileSync
        Body: body
      })
    );

    debug(`Uploaded ${key}`);
    return;
}

async function _syncS3(bomManifest, testRunId, bucketName) {
  const metadata: any = {
    createdOn: Date.now(),
    name: testRunId,
    modules: bomManifest.modules
  };

  //TODO: parallelise this
  let fileCount = 0;
  for (const file of bomManifest.files) {
    await _uploadFileToS3(
      file,
      testRunId,
      bucketName,
      bomManifest.moduleVersions
    );
    fileCount++;
  }
  metadata.fileCount = fileCount;

  const plainS3 = createS3Client();
  const prefix = `tests/${testRunId}`;
    const key = `${prefix}/metadata.json`;
    await plainS3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        // TODO: stream, not readFileSync
        Body: JSON.stringify(metadata)
      })
    );

    debug(`Uploaded ${key}`);
    return `s3://${bucketName}/${key}`;
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

export { createAndUploadTestDependencies };