const { getBucketName } = require('./util');
const createS3Client = require('./create-s3-client');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

class TestBundle {
  constructor(id) {
    this.id = id;
    this.manifest = null;
  }

  async getManifest() {
    if (this.manifest) {
      return this.manifest;
    }

    const s3 = createS3Client();

    const bucketName = await getBucketName();

    const params = {
      Bucket: bucketName,
      Key: `tests/${this.id}/metadata.json`
    };

    const s3Data = await s3.send(new GetObjectCommand(params));
    this.manifest = JSON.parse(await s3Data.Body.transformToString());

    return this.manifest;
  }
}

module.exports = {
  TestBundle
};
