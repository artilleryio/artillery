const { EventEmitter } = require('eventemitter3');
const debug = require('debug')('queue-consumer');
const { Consumer } = require('sqs-consumer');

class QueueConsumer extends EventEmitter {
  create(opts = { poolSize: 30 }, queueConsumerOpts) {
    this.events = new EventEmitter();

    this.consumers = [];

    for (let i = 0; i < opts.poolSize; i++) {
      const sqsConsumer = Consumer.create(queueConsumerOpts);

      sqsConsumer.on('error', (err) => {
        // TODO: Ignore "SQSError: SQS delete message failed:" errors

        if (err.message && err.message.match(/ReceiptHandle.+expired/i)) {
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

  constructor(opts) {
    super();
    return this;
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

module.exports = { QueueConsumer };
