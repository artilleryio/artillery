// Copyright (c) Artillery Software Inc.
// SPDX-License-Identifier: BUSL-1.1
//
// Non-evaluation use of Artillery on Azure requires a commercial license
//


import { DefaultAzureCredential } from '@azure/identity';
import { QueueClient } from '@azure/storage-queue';
import createDebug from 'debug';
import { EventEmitter } from 'eventemitter3';

const debug = createDebug('platform:azure-aci');

class AzureQueueConsumer extends EventEmitter {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  constructor(
    opts = { poolSize: 30 },
    {
      queueUrl,
      pollIntervalMsec = 5000,
      visibilityTimeout = 60,
      batchSize = 32,
      handleMessage
    }
  ) {
    super();
    this.queueUrl = queueUrl;
    this.batchSize = batchSize;
    this.visibilityTimeout = visibilityTimeout;
    this.handleMessage = handleMessage;
    this.pollIntervalMsec = pollIntervalMsec;

    this.poolSize = opts.poolSize;

    this.consumers = [];
  }

  async start() {
    const credential = new DefaultAzureCredential();

    for (let i = 0; i < this.poolSize; i++) {
      debug('Creating consumer in pool', i);
      const queueClient = new QueueClient(this.queueUrl, credential);
      const pollInterval = setInterval(async () => {
        const messages = await queueClient.receiveMessages({
          numberOfMessages: this.batchSize,
          visibilityTimeout: this.visibilityTimeout
        });

        // TODO: Handle errors - no auth, no queue, network etc

        for (const messageItem of messages.receivedMessageItems) {
          const message = {
            Body: messageItem.messageText
          };

          let processed = false;
          try {
            await this.handleMessage(message);
            processed = true;
          } catch (err) {
            console.log(err);
          }

          if (processed) {
            try {
              await queueClient.deleteMessage(
                messageItem.messageId,
                messageItem.popReceipt
              );
            } catch (_err) {}
          }
        }
      }, this.pollIntervalMsec);

      this.consumers.push(pollInterval);
    }
  }

  async stop() {
    for (const interval of this.consumers) {
      clearInterval(interval);
    }
  }

  // TODO: events: error, empty
}

export { AzureQueueConsumer as QueueConsumer };