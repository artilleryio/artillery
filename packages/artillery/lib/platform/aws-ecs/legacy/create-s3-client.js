const S3 = require('aws-sdk/clients/s3');

module.exports = createS3Client;

function createS3Client(opts) {
  let defaultOpts = {
    apiVersion: '2006-03-01'
  };

  defaultOpts = Object.assign(defaultOpts, opts);

  if (process.env.ARTILLERY_S3_OPTS) {
    defaultOpts = Object.assign(
      defaultOpts,
      JSON.parse(process.env.ARTILLERY_S3_OPTS)
    );
  }

  const s3 = new S3(defaultOpts);
  return s3;
}
