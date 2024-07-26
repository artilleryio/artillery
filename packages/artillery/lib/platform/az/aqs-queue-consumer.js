// Copyright (c) Artillery Software Inc.
// SPDX-License-Identifier: BUSL-1.1
//
// Non-evaluation use of Artillery on Azure requires a commercial license
//

const EventEmitter = require('eventemitter3');

const { QueueClient } = require('@azure/storage-queue');
const { DefaultAzureCredential } = require('@azure/identity');

class AzureQueueConsumer extends EventEmitter {
  constructor(
    {} = { poolSize: 30 },
    { queueUrl, visibilityTimeout = 60, batchSize = 32, handleMessage }
  ) {
    super();
    this.queueUrl = queueUrl;
    this.batchSize = batchSize;
    this.visibilityTimeout = visibilityTimeout;
    this.handleMessage = handleMessage;

    // TODO: Implement this
    this.poolSize = this.poolSize;
    return this;
  }

  async start() {
    const credential = new DefaultAzureCredential();
    this.queueClient = new QueueClient(this.queueUrl, credential);

    this.pollInterval = setInterval(async () => {
      const messages = await this.queueClient.receiveMessages({
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
            await this.queueClient.deleteMessage(
              messageItem.messageId,
              messageItem.popReceipt
            );
          } catch (_err) {}
        }
      }
    }, 5 * 1000);
  }

  async stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  // TODO: events: error, empty
}

module.exports = { QueueConsumer: AzureQueueConsumer };
