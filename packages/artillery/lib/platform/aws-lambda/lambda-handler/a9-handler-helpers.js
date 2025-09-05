const { spawn } = require('node:child_process');
const { S3Client, GetBucketLocationCommand } = require('@aws-sdk/client-s3');

async function getBucketRegion(bucketName) {
  const c = new S3Client({ region: 'us-east-1' });
  const command = new GetBucketLocationCommand({
    Bucket: bucketName
  });

  const response = await c.send(command);

  // Buckets is us-east-1 have a LocationConstraint of null
  const location = response.LocationConstraint || 'us-east-1';
  return location;
}

const sleep = async function (n) {
  return new Promise((resolve, _reject) => {
    setTimeout(function () {
      resolve();
    }, n);
  });
};

async function runProcess(name, args, { env, log }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(name, args, { env });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      if (log) {
        console.log(data.toString());
      }
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      if (log) {
        console.error(data.toString());
      }

      stderr += data.toString();
    });

    proc.once('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on('error', (err) => {
      resolve({ stdout, stderr, err });
    });
  });
}

module.exports = {
  runProcess,
  sleep,
  getBucketRegion
};
