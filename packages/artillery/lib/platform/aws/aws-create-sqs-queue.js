const AWS = require('aws-sdk');
const debug = require('debug')('artillery:aws-create-sqs-queue');
const sleep = require('../../util/sleep');

// TODO: Add timestamp to SQS queue name for automatic GC
async function createSQSQueue(region, queueName) {
  const sqs = new AWS.SQS({
    region
  });

  const params = {
    QueueName: queueName,
    Attributes: {
      FifoQueue: 'true',
      ContentBasedDeduplication: 'false',
      MessageRetentionPeriod: '1800',
      VisibilityTimeout: '600'
    }
  };

  let sqsQueueUrl;
  try {
    const result = await sqs.createQueue(params).promise();
    sqsQueueUrl = result.QueueUrl;
  } catch (err) {
    throw err;
  }

  // Wait for the queue to be available:
  let waited = 0;
  let ok = false;
  while (waited < 120 * 1000) {
    try {
      const results = await sqs
        .listQueues({ QueueNamePrefix: queueName })
        .promise();
      if (results.QueueUrls && results.QueueUrls.length === 1) {
        debug('SQS queue created:', queueName);
        ok = true;
        break;
      } else {
        await sleep(10 * 1000);
        waited += 10 * 1000;
      }
    } catch (err) {
      await sleep(10 * 1000);
      waited += 10 * 1000;
    }
  }

  if (!ok) {
    debug('Time out waiting for SQS queue:', queueName);
    throw new Error('SQS queue could not be created');
  }

  return sqsQueueUrl;
}

module.exports = createSQSQueue;
