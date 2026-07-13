
import {
  CreateQueueCommand,
  ListQueuesCommand, 
  SQSClient
} from '@aws-sdk/client-sqs';
import createDebug from 'debug';

const debug = createDebug('artillery:aws-create-sqs-queue');

import sleep from '../../util/sleep.ts';

// TODO: Add timestamp to SQS queue name for automatic GC
async function createSQSQueue(region, queueName) {
  const sqs = new SQSClient({
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

  const result = await sqs.send(new CreateQueueCommand(params));
  const sqsQueueUrl = result.QueueUrl;

  // Wait for the queue to be available:
  let waited = 0;
  let ok = false;
  while (waited < 120 * 1000) {
    try {
      const results = await sqs.send(
        new ListQueuesCommand({ QueueNamePrefix: queueName })
      );
      if (results.QueueUrls && results.QueueUrls.length === 1) {
        debug('SQS queue created:', queueName);
        ok = true;
        break;
      } else {
        await sleep(10 * 1000);
        waited += 10 * 1000;
      }
    } catch (_err) {
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

export default createSQSQueue;
