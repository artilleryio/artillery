import createDebug from 'debug';
import { EventEmitter } from 'eventemitter3';

const debug = createDebug('queue-consumer');

import { Consumer } from 'sqs-consumer';

class QueueConsumer extends EventEmitter {
  declare events: EventEmitter;
  declare consumers: Consumer[];

  create(
    opts: { poolSize: number } = { poolSize: 30 },
    queueConsumerOpts?: Record<string, any>
  ) {
    this.events = new EventEmitter();

    this.consumers = [];

    for (let i = 0; i < opts.poolSize; i++) {
      const sqsConsumer = Consumer.create(
        queueConsumerOpts as Parameters<typeof Consumer.create>[0]
      );

      sqsConsumer.on('error', (err) => {
        // TODO: Ignore "SQSError: SQS delete message failed:" errors

        if (err.message?.match(/ReceiptHandle.+expired/i)) {
          debug(err.name, err.message);
        } else {
          sqsConsumer.stop();
          this.emit('error', err);
        }
      });

      let empty = 0;
      sqsConsumer.on('empty', () => {
        empty++;
        if (empty > 10) {
          this.emit('messageReceiveTimeout'); // TODO:
        }
      });

      this.consumers.push(sqsConsumer);
    }

    return this;
  }

  constructor(_opts?: unknown) {
    super();
  }

  start() {
    for (const consumer of this.consumers) {
      consumer.start();
    }
  }

  stop() {
    for (const consumer of this.consumers) {
      consumer.stop();
    }
  }
}

export { QueueConsumer };
