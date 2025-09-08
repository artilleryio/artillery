/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const debug = require('debug')('plugin:sqsReporter');
const uuid = require('node:crypto').randomUUID;
const { getAQS, sendMessage } = require('./azure-aqs');

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

  if (process.env.AZURE_STORAGE_QUEUE_URL) {
    this.aqs = getAQS();
  }

  events.on('stats', (statsOriginal) => {
    let body;
    const serialized = global.artillery.__SSMS.serializeMetrics(statsOriginal);
    body = {
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

  const params = {
    MessageBody: payload,
    QueueUrl: this.queueUrl,
    MessageAttributes: this.messageAttributes,
    MessageDeduplicationId: uuid(),
    MessageGroupId: this.testId
  };

  try {
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
