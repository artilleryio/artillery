const EventEmitter = require('events');

const { Consumer } = require('sqs-consumer');
const driftless = require('driftless');
const debug = require('debug')('sqs-reporter');
const debugV = require('debug')('sqs-reporter:v');

const _ = require('lodash');

class SqsReporter extends EventEmitter {
  constructor(opts) {
    super();

    this.sqsQueueUrl = opts.sqsQueueUrl;
    this.region = opts.region;
    this.testId = opts.testId;
    this.count = opts.count;

    this.periodsReportedFor = [];

    this.ee = new EventEmitter();

    this.workerState = {};
    this.lastIntermediateReportAt = 0;
    this.taskWatcher = null;

    this.metricsByPeriod = {}; // individual intermediates by worker
    this.mergedPeriodMetrics = []; // merged intermediates for a period

    //TODO: this code is repeated from `launch-platform.js` - refactor later
    this.phaseStartedEventsSeen = {};
    this.phaseCompletedEventsSeen = {};

    // Debug info:
    this.messagesProcessed = {};
    this.metricsMessagesFromWorkers = {};

    this.poolSize =
      typeof process.env.SQS_CONSUMER_POOL_SIZE !== 'undefined'
        ? parseInt(process.env.SQS_CONSUMER_POOL_SIZE, 10)
        : Math.max(Math.ceil(this.count / 10), 75);
  }

  _allWorkersDone() {
    return Object.keys(this.workerState).length === this.count;
  }

  stop() {
    debug('stopping');
    for (const sqsConsumer of this.sqsConsumers) {
      sqsConsumer.stop();
    }
  }

  start() {
    debug('starting');
    const self = this;

    self.sqsDebugInterval = driftless.setDriftlessInterval(() => {
      debug(self.messagesProcessed);
      let total = 0;
      for (const [k, v] of Object.entries(self.messagesProcessed)) {
        total += v;
      }
      debug('total:', total);
    }, 10 * 1000);

    self.intermediateReporterInterval = driftless.setDriftlessInterval(() => {
      if (Object.keys(self.metricsByPeriod).length === 0) {
        return; // nothing received yet
      }

      // We always look at the earliest period available so that reports come in chronological order
      const earliestPeriodAvailable = Object.keys(self.metricsByPeriod)
        .filter((x) => self.periodsReportedFor.indexOf(x) === -1)
        .sort()[0];

      // TODO: better name. One above is earliestNotAlreadyReported
      const earliest = Object.keys(self.metricsByPeriod).sort()[0];
      if (self.periodsReportedFor.indexOf(earliest) > -1) {
        global.artillery.log(
          'Warning: multiple batches of metrics for period',
          earliest,
          new Date(Number(earliest))
        );
        delete self.metricsByPeriod[earliest]; // FIXME: need to merge them in for the final report
      }

      // We can process SQS messages in batches of 10 at a time, so
      // when there are more workers, we need to wait longer:
      const MAX_WAIT_FOR_PERIOD_MS =
        (Math.ceil(self.count / 10) * 2 + 20) * 1000;

      if (
        typeof earliestPeriodAvailable !== 'undefined' &&
        (self.metricsByPeriod[earliestPeriodAvailable].length === self.count ||
          Date.now() - Number(earliestPeriodAvailable) > MAX_WAIT_FOR_PERIOD_MS)
      ) {
        // TODO: autoscaling. Handle workers that drop off as the first case - self.count needs to be updated dynamically
        debug(
          'have metrics from all workers for period or MAX_WAIT_FOR_PERIOD reached',
          earliestPeriodAvailable
        );

        debug(
          'Report @',
          new Date(Number(earliestPeriodAvailable)),
          'made up of items:',
          self.metricsByPeriod[String(earliestPeriodAvailable)].length
        );

        // TODO: Track how many workers provided metrics in the metrics report
        const stats = global.artillery.__SSMS.mergeBuckets(
          self.metricsByPeriod[String(earliestPeriodAvailable)]
        )[String(earliestPeriodAvailable)];
        self.mergedPeriodMetrics.push(stats);
        // summarize histograms for console reporter
        stats.summaries = {};
        for (const [name, value] of Object.entries(stats.histograms || {})) {
          const summary = global.artillery.__SSMS.summarizeHistogram(value);
          stats.summaries[name] = summary;
          delete self.metricsByPeriod[String(earliestPeriodAvailable)];
        }

        self.periodsReportedFor.push(earliestPeriodAvailable);

        debug('Emitting stats event');
        self.emit('stats', stats);
      } else {
        debug('Waiting for more workerStats before emitting stats event');
      }
    }, 5 * 1000);

    self.workersDoneWatcher = driftless.setDriftlessInterval(() => {
      if (!self._allWorkersDone()) {
        return;
      }

      // Have we received and processed all intermediate metrics?
      if (Object.keys(self.metricsByPeriod).length > 0) {
        debug(
          'All workers done but still waiting on some intermediate reports'
        );
        return;
      }

      debug('ready to emit done event');
      debug('mergedPeriodMetrics');
      debug(self.mergedPeriodMetrics);

      // Merge by period, then compress and emit
      const stats = global.artillery.__SSMS.pack(self.mergedPeriodMetrics);
      stats.summaries = {};
      for (const [name, value] of Object.entries(stats.histograms || {})) {
        const summary = global.artillery.__SSMS.summarizeHistogram(value);
        stats.summaries[name] = summary;
      }

      if (process.env.DEBUG === 'sqs-reporter:v') {
        for (const [workerId, metrics] of Object.entries(
          self.metricsMessagesFromWorkers
        )) {
          debugV('worker', workerId, '->', metrics.length, 'items');
        }
        // fs.writeFileSync('worker-metrics-dump.json', JSON.stringify(self.metricsMessagesFromWorkers));
      }

      self.emit('done', stats);

      driftless.clearDriftless(self.intermediateReporterInterval);
      driftless.clearDriftless(self.workersDoneWatcher);
      driftless.clearDriftless(self.sqsDebugInterval);

      for (const sqsConsumer of self.sqsConsumers) {
        sqsConsumer.stop();
      }

      self.emit('workersDone', self.workerState);
    }, 5 * 1000);

    this.ee.on('message', function (body, attrs) {
      const workerId = attrs.workerId?.StringValue;

      if (!workerId) {
        debug('Got message with no workerId');
        debug(body);
        return;
      }
      if (body.event === 'workerDone' || body.event === 'workerError') {
        self.workerState[workerId] = body.event;
        self.emit(body.event, body, attrs);

        debug(workerId, body.event);
        return;
      }

      //TODO: this code is repeated from `launch-platform.js` - refactor later
      if (body.event === 'phaseStarted') {
        if (
          typeof self.phaseStartedEventsSeen[body.phase.index] === 'undefined'
        ) {
          self.phaseStartedEventsSeen[body.phase.index] = Date.now();
          self.emit(body.event, body.phase);
        }

        return;
      }

      //TODO: this code is repeated from `launch-platform.js` - refactor later
      if (body.event === 'phaseCompleted') {
        if (
          typeof self.phaseCompletedEventsSeen[body.phase.index] === 'undefined'
        ) {
          self.phaseCompletedEventsSeen[body.phase.index] = Date.now();
          self.emit(body.event, body.phase);
        }

        return;
      }

      // 'done' event is from SQS Plugin - unused for now
      if (body.event === 'done') {
        return;
      }

      if (body.msg) {
        self.emit('workerMessage', body, attrs);
        return;
      }

      if (body.event === 'workerStats') {
        // v2 SSMS stats
        const workerStats = global.artillery.__SSMS.deserializeMetrics(
          body.stats
        );
        const period = workerStats.period;

        debug(
          'processing workerStats event, worker:',
          workerId,
          'period',
          period
        );

        debugV(workerStats);
        if (typeof self.metricsByPeriod[period] === 'undefined') {
          self.metricsByPeriod[period] = [];
        }
        self.metricsByPeriod[period].push(workerStats);

        if (process.env.DEBUG === 'sqs-reporter:v') {
          if (
            typeof self.metricsMessagesFromWorkers[workerId] === 'undefined'
          ) {
            self.metricsMessagesFromWorkers[workerId] = [];
          }
          self.metricsMessagesFromWorkers[workerId].push(workerStats);
        }

        debugV('metricsByPeriod:');
        debugV(self.metricsByPeriod);
        debug('number of periods processed');
        debug(Object.keys(self.metricsByPeriod));
        debug('number of metrics collections for period:', period, ':');
        debug(self.metricsByPeriod[period].length, 'expecting:', self.count);
      }
    });

    this.ee.on('messageReceiveTimeout', () => {
      // TODO: 10 polls with no results, e.g. if all workers crashed
    });

    const createConsumer = function (i) {
      return Consumer.create({
        queueUrl: process.env.SQS_QUEUE_URL || self.sqsQueueUrl,
        region: self.region,
        waitTimeSeconds: 10,
        messageAttributeNames: ['testId', 'workerId'],
        visibilityTimeout: 60,
        batchSize: 10,
        handleMessage: async (message) => {
          let body = null;
          try {
            body = JSON.parse(message.Body);
          } catch (err) {
            console.error(err);
            console.log(message.Body);
          }

          //
          // Ignore any messages that are invalid or not tagged properly.
          //

          if (process.env.LOG_SQS_MESSAGES) {
            console.log(message);
          }

          if (!body) {
            throw new Error();
          }

          const attrs = message.MessageAttributes;
          if (!attrs || !attrs.testId) {
            throw new Error();
          }

          if (self.testId !== attrs.testId.StringValue) {
            throw new Error();
          }

          if (!self.messagesProcessed[i]) {
            self.messagesProcessed[i] = 0;
          }
          self.messagesProcessed[i] += 1;

          process.nextTick(function () {
            self.ee.emit('message', body, attrs);
          });
        }
      });
    };

    this.sqsConsumers = [];
    for (let i = 0; i < this.poolSize; i++) {
      const sqsConsumer = createConsumer(i);

      sqsConsumer.on('error', (err) => {
        // TODO: Ignore "SQSError: SQS delete message failed:" errors
        if (err.message && err.message.match(/ReceiptHandle.+expired/i)) {
          debug(err.name, err.message);
        } else {
          artillery.log(err);
          sqsConsumer.stop();
          self.emit('error', err);
        }
      });

      let empty = 0;
      sqsConsumer.on('empty', () => {
        empty++;
        if (empty > 10) {
          self.ee.emit('messageReceiveTimeout'); // TODO:
        }
      });
      sqsConsumer.start();

      self.sqsConsumers.push(sqsConsumer);
    }
  }

  // Given a (combined) stats object, what's the difference between the
  // time of earliest and latest requests made?
  calculateSpread(stats) {
    const period = _.reduce(
      stats._requestTimestamps,
      (acc, ts) => {
        acc.min = Math.min(acc.min, ts);
        acc.max = Math.max(acc.max, ts);
        return acc;
      },
      { min: Infinity, max: 0 }
    );

    const spread = round((period.max - period.min) / 1000, 1);
    return spread;
  }
}

function round(number, decimals) {
  const m = Math.pow(10, decimals);
  return Math.round(number * m) / m;
}

module.exports = { SqsReporter };
