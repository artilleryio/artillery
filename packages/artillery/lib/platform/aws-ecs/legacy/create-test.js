'use strict';

const A = require('async');
const debug = require('debug')('commands:create-test');

const { getBucketName } = require('./util');
const createS3Client = require('./create-s3-client');

const path = require('path');

const fs = require('fs');

const { createBOM, prettyPrint } = require('./bom');

const { PutObjectCommand } = require('@aws-sdk/client-s3');

function tryCreateTest(scriptPath, options) {
  createTest(scriptPath, options);
}

async function createTest(scriptPath, options, callback) {
  const absoluteScriptPath = path.resolve(process.cwd(), scriptPath);

  const contextPath = options.context
    ? path.resolve(options.context)
    : path.dirname(absoluteScriptPath);

  debug('script:', absoluteScriptPath);
  debug('root:', contextPath);

  let context = {
    contextDir: contextPath,
    scriptPath: absoluteScriptPath,
    originalScriptPath: scriptPath,
    name: options.name, // test name, eg simple-bom or aht_$UUID
    manifestPath: options.manifestPath,
    packageJsonPath: options.packageJsonPath,
    flags: options.flags
  };

  if (typeof options.config === 'string') {
    const absoluteConfigPath = path.resolve(process.cwd(), options.config);
    context.configPath = absoluteConfigPath;
  }

  if (options.customSyncClient) {
    context.customSyncClient = options.customSyncClient;
  }

  return new Promise((resolve, reject) => {
    A.waterfall(
      [
        A.constant(context),
        async function (context) {
          if (!context.customSyncClient) {
            context.s3Bucket = await getBucketName();
            return context;
          } else {
            context.s3Bucket = 'S3_BUCKET_ARGUMENT_NOT_USED_ON_AZURE';
            return context;
          }
        },
        prepareManifest,
        printManifest,
        syncS3,
        writeTestMetadata
      ],
      function (err, context) {
        if (err) {
          console.log(err);
          return;
        }

        if (callback) {
          callback(err, context);
        } else if (err) {
          reject(err);
        } else {
          resolve(context);
        }
      }
    );
  });
}

function prepareManifest(context, callback) {
  let fileToAnalyse = context.scriptPath;
  let extraFiles = [];
  if (context.configPath) {
    debug('context has been provided; extraFiles =', extraFiles);
    fileToAnalyse = context.configPath;
    extraFiles.push(context.scriptPath);
  }

  createBOM(
    fileToAnalyse,
    extraFiles,
    {
      packageJsonPath: context.packageJsonPath,
      flags: context.flags,
      scenarioPath: context.scriptPath
    },
    (err, bom) => {
      debug(err);
      debug(bom);
      context.manifest = bom;
      return callback(err, context);
    }
  );
}

function printManifest(context, callback) {
  prettyPrint(context.manifest);
  return callback(null, context);
}

async function syncS3(context) {
  let s3;
  if (context.customSyncClient) {
    s3 = context.customSyncClient;
  } else {
    s3 = createS3Client();
  }

  const prefix = `tests/${context.name}`;

  context.s3Prefix = prefix;

  debug('Will try syncing to:', context.s3Bucket);

  debug('Manifest: ', context.manifest);

  // Iterate through manifest, for each element: has orig (local source) and noPrefix (S3
  // destination) properties
  return new Promise((resolve, reject) => {
    A.eachLimit(
      context.manifest.files,
      3,
      async (item, eachDone) => {
        // If we can't read the file, it may have been specified with a
        // template in its name, e.g. a payload file like:
        // {{ $environment }}-users.csv
        // If so, ignore it, hope config.includeFiles was used, and let
        // "artillery run" in the worker deal with it.
        let body;
        try {
          body = fs.readFileSync(item.orig);
        } catch (fsErr) {
          debug(fsErr);
        }

        if (!body) {
          return eachDone(null, context);
        }

        const key = context.s3Prefix + '/' + item.noPrefixPosix;
        await s3.send(
          new PutObjectCommand({
            Bucket: context.s3Bucket,
            Key: key,
            Body: body
          })
        );
      },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(context);
        }
      }
    );
  });
}

// create just overwrites an existing test for now
async function writeTestMetadata(context) {
  const metadata = {
    createdOn: Date.now(),
    name: context.name,
    modules: context.manifest.modules
  };

  // Here we need to provide config information (if given) -- so that the worker knows how to load it
  if (context.configPath) {
    const res = context.manifest.files.filter((o) => {
      return o.orig === context.configPath;
    });
    const newConfigPath = res[0].noPrefixPosix; // if we have been given a config, we must have an entry
    metadata.configPath = newConfigPath;
  }

  const newScriptPath = context.manifest.files.filter((o) => {
    return o.orig === context.scriptPath;
  })[0].noPrefixPosix;
  metadata.scriptPath = newScriptPath;

  debug('metadata', metadata);

  let s3 = null;
  if (context.customSyncClient) {
    s3 = context.customSyncClient;
  } else {
    s3 = createS3Client();
  }

  const key = context.s3Prefix + '/metadata.json'; // TODO: Rename to something less likely to clash
  debug('metadata location:', `${context.s3Bucket}/${key}`);
  await s3.send(
    new PutObjectCommand({
      Body: JSON.stringify(metadata),
      Bucket: context.s3Bucket,
      Key: key
    })
  );

  return context;
}

module.exports = {
  tryCreateTest,
  createTest,
  syncS3,
  prepareManifest
};
