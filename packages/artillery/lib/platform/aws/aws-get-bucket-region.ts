import { GetBucketLocationCommand, S3Client } from '@aws-sdk/client-s3';

async function getBucketRegion(bucketName) {
  const c = new S3Client({ region: global.artillery.awsRegion || 'us-east-1' });
  const command = new GetBucketLocationCommand({
    Bucket: bucketName
  });

  const response = await c.send(command);

  // Buckets is us-east-1 have a LocationConstraint of null
  const location = response.LocationConstraint || 'us-east-1';
  return location;
}

export { getBucketRegion };