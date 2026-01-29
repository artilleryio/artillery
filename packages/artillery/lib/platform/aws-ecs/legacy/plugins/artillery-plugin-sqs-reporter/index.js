/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const _debug = require('debug')('plugin:sqsReporter');
const uuid = require('node:crypto').randomUUID;
const { getAQS, sendMessage } = require('./azure-aqs');

// SQS has 1MB message limit. Use 950KB threshold for safety margin.
const SQS_SIZE_LIMIT = 950 * 1024;

module.exports = {
  Plugin: ArtillerySQSPlugin,
  LEGACY_METRICS_FORMAT: false
};

function ArtillerySQSPlugin(script, events) {
  this.script = script;
  this.events = events;

  this.unsent = 0;

  // List of objects: [{key: 'SomeKey', value: 'SomeValue'}, ...]
  this.tags = process.env.SQS_TAGS ? JSON.parse(process.env.SQS_TAGS) : [];
  this.testId = null;
  const messageAttributes = {};

  this.tags.forEach((tag) => {
    if (tag.key === 'testId') {
      this.testId = tag.value;
    }
    messageAttributes[tag.key] = {
      DataType: 'String',
      StringValue: tag.value
    };
  });

  this.messageAttributes = messageAttributes;

  this.sqs = null;
  this.aqs = null;

  if (process.env.SQS_QUEUE_URL) {
    this.sqs = new SQSClient({
      region:
        process.env.SQS_REGION || script.config.plugins['sqs-reporter'].region
    });

    this.queueUrl =
      process.env.SQS_QUEUE_URL ||
      script.config.plugins['sqs-reporter'].queueUrl;
  }

  this.s3 = null;
  this.s3Bucket = process.env.ARTILLERY_S3_BUCKET || null;
  if (this.sqs && this.s3Bucket) {
    this.s3 = new S3Client({
      region:
        process.env.SQS_REGION || script.config.plugins['sqs-reporter'].region
    });
  }

  if (process.env.AZURE_STORAGE_QUEUE_URL) {
    this.aqs = getAQS();
  }

  events.on('stats', (statsOriginal) => {
    const serialized = global.artillery.__SSMS.serializeMetrics(statsOriginal);
    const body = {
      event: 'workerStats',
      stats: serialized
    };

    this.sendMessage(body);
  });

  //TODO: reconcile some of this code with how lambda does sqs reporting
  events.on('phaseStarted', (phaseContext) => {
    const body = {
      event: 'phaseStarted',
      phase: phaseContext
    };

    this.sendMessage(body);
  });

  //TODO: reconcile some of this code with how lambda does sqs reporting
  events.on('phaseCompleted', (phaseContext) => {
    const body = {
      event: 'phaseCompleted',
      phase: phaseContext
    };
    this.sendMessage(body);
  });

  events.on('done', (_stats) => {
    const body = {
      event: 'done',
      stats: global.artillery.__SSMS.serializeMetrics(_stats)
    };
    this.sendMessage(body);
  });

  global.artillery.globalEvents.on('log', (opts, ...args) => {
    if (process.env.SHIP_LOGS) {
      const body = {
        event: 'artillery.log',
        log: {
          opts,
          args: [...args]
        }
      };

      this.sendMessage(body);
    }
  });

  return this;
}

ArtillerySQSPlugin.prototype.cleanup = function (done) {
  const interval = setInterval(() => {
    if (this.unsent <= 0) {
      clearInterval(interval);
      done(null);
    }
  }, 200).unref();
};

ArtillerySQSPlugin.prototype.sendMessage = function (body) {
  if (this.sqs) {
    this.sendSQS(body);
  } else {
    this.sendAQS(body);
  }
};

ArtillerySQSPlugin.prototype.sendSQS = async function (body) {
  this.unsent++;

  const payload = JSON.stringify(body);
  const payloadSize = Buffer.byteLength(payload, 'utf8');

  try {
    let messageBody = payload;

    // Upload to S3 if payload exceeds SQS limit
    if (payloadSize > SQS_SIZE_LIMIT && this.s3 && this.s3Bucket) {
      const workerId = this.tags.find((t) => t.key === 'workerId')?.value;
      const messageId = uuid();
      const s3Key = `tests/${this.testId}/overflow/${workerId}/${messageId}.json`;

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.s3Bucket,
          Key: s3Key,
          Body: payload,
          ContentType: 'application/json'
        })
      );

      messageBody = JSON.stringify({
        event: body.event,
        _overflowRef: s3Key
      });

      _debug(
        'Payload %d bytes exceeded limit, uploaded to S3: %s',
        payloadSize,
        s3Key
      );
    }

    const params = {
      MessageBody: messageBody,
      QueueUrl: this.queueUrl,
      MessageAttributes: this.messageAttributes,
      MessageDeduplicationId: uuid(),
      MessageGroupId: this.testId
    };

    await this.sqs.send(new SendMessageCommand(params));
  } catch (err) {
    console.error(err);
  } finally {
    this.unsent--;
  }
};

ArtillerySQSPlugin.prototype.sendAQS = async function (body) {
  this.unsent++;
  sendMessage(this.aqs, body, this.tags)
    .then((_res) => {
      this.unsent--;
    })
    .catch((err) => {
      console.error(err);
      this.unsent--;
    });
};
