const { S3Client } = require('@aws-sdk/client-s3');

module.exports = createS3Client;

function createS3Client(opts = {}) {
  const defaultOpts = {
    apiVersion: '2006-03-01'
  };

  let clientOpts = Object.assign(defaultOpts, opts);

  if (process.env.ARTILLERY_S3_OPTS) {
    clientOpts = Object.assign(
      defaultOpts,
      JSON.parse(process.env.ARTILLERY_S3_OPTS)
    );
  }

  if (!opts.region) {
    clientOpts.region = global.artillery.s3BucketRegion;
  }

  return new S3Client(clientOpts);
}
