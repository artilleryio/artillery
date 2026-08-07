import { PutObjectCommand } from '@aws-sdk/client-s3';
import createDebug from 'debug';
import fs from 'fs-extra';

const debug = createDebug('platform:aws-lambda');

import { promisify } from 'node:util';
import Table from 'cli-table3';
import type { BomFileEntry } from '../../create-bom/create-bom.ts';
import { createBOM, enrichPackageJson } from '../aws-ecs/legacy/bom.ts';
import createS3Client from '../aws-ecs/legacy/create-s3-client.ts';

// The manifest shape produced by the legacy BOM (see
// aws-ecs/legacy/bom.ts) as consumed here.
interface LambdaBomManifest {
  files: BomFileEntry[];
  modules: string[];
  pkgDeps: string[];
  moduleVersions?: Record<string, string>;
  [key: string]: any;
}

const _createLambdaBom = async (
  absoluteScriptPath: string,
  absoluteConfigPath: string | undefined | null,
  flags: Record<string, any> | undefined
) => {
  const createBomOpts: Record<string, any> = {};
  let entryPoint = absoluteScriptPath;
  const extraFiles: string[] = [];
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

  const bom = (await promisify(createBOM)(
    entryPoint,
    extraFiles,
    createBomOpts
  )) as LambdaBomManifest;

  return bom;
};

async function _uploadFileToS3(
  item: BomFileEntry,
  testRunId: string,
  bucketName: string,
  moduleVersions: Record<string, string> | undefined
) {
  const s3 = createS3Client();
  const prefix = `tests/${testRunId}`;
  let body: Buffer | undefined;
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

async function _syncS3(
  bomManifest: LambdaBomManifest,
  testRunId: string,
  bucketName: string
) {
  const metadata: Record<string, any> = {
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
  bucketName: string,
  testRunId: string,
  absoluteScriptPath: string,
  absoluteConfigPath: string | undefined | null,
  flags: Record<string, any> | undefined
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
