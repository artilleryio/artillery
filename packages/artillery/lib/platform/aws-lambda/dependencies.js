const fs = require('fs-extra');
const path = require('path');
const temp = require('temp');
const spawn = require('cross-spawn');
const archiver = require('archiver');
const AWS = require('aws-sdk');
const debug = require('debug')('platform:aws-lambda');
const Table = require('cli-table3');
const { randomUUID } = require('crypto');
const { promisify } = require('node:util');
const { createBOM: createBOMForZip } = require('../../create-bom/create-bom');
const { createBOM: createBOMForContainer } = require('../aws-ecs/legacy/bom');

const _createLambdaBom = async (
  absoluteScriptPath,
  absoluteConfigPath,
  flags
) => {
  let createBomOpts = {};
  let entryPoint = absoluteScriptPath;
  let extraFiles = [];
  if (absoluteConfigPath) {
    entryPoint = absoluteConfigPath;
    extraFiles.push(absoluteScriptPath);
    createBomOpts.entryPointIsConfig = true;
  }
  // TODO: custom package.json path here
  if (flags) {
    createBomOpts.flags = flags;
  }

  const createBOM = flags.container ? createBOMForContainer : createBOMForZip;

  const bom = await promisify(createBOM)(entryPoint, extraFiles, createBomOpts);

  return bom;
};

async function createZip(src, out) {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(src, false)
      .on('error', (err) => reject(err))
      .pipe(stream);

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

async function _uploadLambdaZip(bucketName, zipfile) {
  const key = `lambda/${randomUUID()}.zip`;

  // TODO: Set lifecycle policy on the bucket/key prefix to delete after 24 hours

  const s3 = new AWS.S3();
  const s3res = await s3
    .putObject({
      Body: fs.createReadStream(zipfile),
      Bucket: bucketName,
      Key: key
    })
    .promise();

  return key;
}

const createAndUploadLambdaZip = async (
  bucketName,
  absoluteScriptPath,
  absoluteConfigPath,
  flags
) => {
  const dirname = temp.mkdirSync(); // TODO: May want a way to override this by the user
  const zipfile = temp.path({ suffix: '.zip' });
  debug({ dirname, zipfile });

  artillery.log('- Bundling test data');
  const bom = await _createLambdaBom(absoluteScriptPath, absoluteConfigPath);

  for (const f of bom.files) {
    artillery.log('  -', f.noPrefix);
  }

  if (flags.dotenv) {
    fs.copyFileSync(
      path.resolve(process.cwd(), flags.dotenv),
      path.join(dirname, path.basename(flags.dotenv))
    );
  }

  // Copy handler:
  fs.copyFileSync(
    path.resolve(__dirname, 'lambda-handler', 'a9-handler-index.js'),
    path.join(dirname, 'a9-handler-index.js')
  );
  fs.copyFileSync(
    path.resolve(__dirname, 'lambda-handler', 'a9-handler-helpers.js'),
    path.join(dirname, 'a9-handler-helpers.js')
  );
  fs.copyFileSync(
    path.resolve(__dirname, 'lambda-handler', 'a9-handler-dependencies.js'),
    path.join(dirname, 'a9-handler-dependencies.js')
  );
  fs.copyFileSync(
    path.resolve(__dirname, 'lambda-handler', 'package.json'),
    path.join(dirname, 'package.json')
  );

  // FIXME: This may overwrite lambda-handler's index.js or package.json
  // Copy files that make up the test:
  for (const o of bom.files) {
    fs.ensureFileSync(path.join(dirname, o.noPrefix));
    fs.copyFileSync(o.orig, path.join(dirname, o.noPrefix));
  }

  artillery.log('- Installing dependencies');
  const { stdout, stderr, status, error } = spawn.sync(
    'npm',
    ['install', '--omit', 'dev'],
    {
      cwd: dirname
    }
  );

  if (error) {
    artillery.log(stdout?.toString(), stderr?.toString(), status, error);
  } else {
    // artillery.log('        npm log is in:', temp.path({suffix: '.log'}));
  }

  // Install extra plugins & engines
  if (bom.modules.length > 0) {
    artillery.log(
      `- Installing extra engines & plugins: ${bom.modules.join(', ')}`
    );
    const { stdout, stderr, status, error } = spawn.sync(
      'npm',
      ['install'].concat(bom.modules),
      { cwd: dirname }
    );
    if (error) {
      artillery.log(stdout?.toString(), stderr?.toString(), status, error);
    }
  }

  // Copy this version of Artillery into the Lambda package
  const a9basepath = path.resolve(__dirname, '..', '..', '..');
  // TODO: read this from .files in package.json instead:
  for (const dir of ['bin', 'lib']) {
    const destdir = path.join(dirname, 'node_modules', 'artillery', dir);
    const srcdir = path.join(a9basepath, dir);
    fs.ensureDirSync(destdir);
    fs.copySync(srcdir, destdir);
  }
  for (const fn of ['console-reporter.js', 'util.js']) {
    const destfn = path.join(dirname, 'node_modules', 'artillery', fn);
    const srcfn = path.join(a9basepath, fn);
    fs.copyFileSync(srcfn, destfn);
  }

  fs.copyFileSync(
    path.resolve(a9basepath, 'package.json'),
    path.join(dirname, 'node_modules', 'artillery', 'package.json')
  );

  const a9cwd = path.join(dirname, 'node_modules', 'artillery');
  debug({ a9basepath, a9cwd });

  const {
    stdout: stdout2,
    stderr: stderr2,
    status: status2,
    error: error2
  } = spawn.sync('npm', ['install', '--omit', 'dev'], { cwd: a9cwd });
  if (error2) {
    artillery.log(stdout2?.toString(), stderr2?.toString(), status2, error2);
  } else {
    // artillery.log('        npm log is in:', temp.path({suffix: '.log'}));
  }

  const {
    stdout: stdout3,
    stderr: stderr3,
    status: status3,
    error: error3
  } = spawn.sync(
    'npm',
    [
      'uninstall',
      'try-require',
      'esbuild-wasm',
      'artillery-plugin-publish-metrics'
    ],
    {
      cwd: a9cwd
    }
  );
  if (error3) {
    artillery.log(stdout3?.toString(), stderr3?.toString(), status3, error3);
  } else {
    // artillery.log('        npm log is in:', temp.path({suffix: '.log'}));
  }

  fs.removeSync(path.join(dirname, 'node_modules', 'aws-sdk'));
  fs.removeSync(path.join(a9cwd, 'node_modules', 'tap'));
  fs.removeSync(path.join(a9cwd, 'node_modules', 'prettier'));

  artillery.log('- Creating zip package');
  await createZip(dirname, zipfile);

  artillery.log('Preparing AWS environment...');
  const s3Path = await _uploadLambdaZip(bucketName, zipfile);
  debug({ s3Path });

  return {
    s3Path,
    bom
  };
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

  const key = prefix + '/' + item.noPrefix;

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
  createAndUploadLambdaZip,
  createAndUploadTestDependencies
};
