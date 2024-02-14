/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const AWS = require('aws-sdk');
const debug = require('debug')('plugin:sqsReporter');
const uuid = require('node:crypto').randomUUID;

module.exports = {
  Plugin: ArtillerySQSPlugin,
  LEGACY_METRICS_FORMAT: false
};

function ArtillerySQSPlugin(script, events) {
  this.script = script;
  this.events = events;

  this.unsent = 0;

  const self = this;

  // List of objects: [{key: 'SomeKey', value: 'SomeValue'}, ...]
  this.tags = process.env.SQS_TAGS ? JSON.parse(process.env.SQS_TAGS) : [];
  this.testId = null;
  let messageAttributes = {};

  this.tags.forEach(function (tag) {
    if (tag.key === 'testId') {
      self.testId = tag.value;
    }
    messageAttributes[tag.key] = {
      DataType: 'String',
      StringValue: tag.value
    };
  });

  this.messageAttributes = messageAttributes;

  this.sqs = new AWS.SQS({
    region:
      process.env.SQS_REGION || script.config.plugins['sqs-reporter'].region
  });

  this.queueUrl =
    process.env.SQS_QUEUE_URL || script.config.plugins['sqs-reporter'].queueUrl;

  events.on('stats', (statsOriginal) => {
    let body;
    const serialized = global.artillery.__SSMS.serializeMetrics(statsOriginal);
    body = {
      event: 'workerStats',
      stats: serialized
    };
    body = JSON.stringify(body);

    debug('Prepared messsage body');
    debug(body);

    this.unsent++;

    // TODO: Check that body is not longer than 255kb
    const params = {
      MessageBody: body,
      QueueUrl: this.queueUrl,
      MessageAttributes: this.messageAttributes,
      MessageDeduplicationId: uuid(),
      MessageGroupId: this.testId
    };

    this.sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.error(err);
      }
      this.unsent--;
    });
  });

  //TODO: reconcile some of this code with how lambda does sqs reporting
  events.on('phaseStarted', (phaseContext) => {
    this.unsent++;
    const body = JSON.stringify({
      event: 'phaseStarted',
      phase: phaseContext
    });

    const params = {
      MessageBody: body,
      QueueUrl: this.queueUrl,
      MessageAttributes: this.messageAttributes,
      MessageDeduplicationId: uuid(),
      MessageGroupId: this.testId
    };

    this.sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.error(err);
      }

      this.unsent--;
    });
  });

  //TODO: reconcile some of this code with how lambda does sqs reporting
  events.on('phaseCompleted', (phaseContext) => {
    this.unsent++;
    const body = JSON.stringify({
      event: 'phaseCompleted',
      phase: phaseContext
    });

    const params = {
      MessageBody: body,
      QueueUrl: this.queueUrl,
      MessageAttributes: this.messageAttributes,
      MessageDeduplicationId: uuid(),
      MessageGroupId: this.testId
    };

    this.sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.error(err);
      }

      this.unsent--;
    });
  });

  events.on('done', (_stats) => {
    this.unsent++;
    const body = JSON.stringify({
      event: 'done'
    });

    const params = {
      MessageBody: body,
      QueueUrl: this.queueUrl,
      MessageAttributes: this.messageAttributes,
      MessageDeduplicationId: uuid(),
      MessageGroupId: this.testId
    };

    this.sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.error(err);
      }

      this.unsent--;
    });
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
