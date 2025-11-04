const EventEmitter = require('node:events');

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

    this.sqsDebugInterval = driftless.setDriftlessInterval(() => {
      debug(this.messagesProcessed);
      let total = 0;
      for (const [_k, v] of Object.entries(this.messagesProcessed)) {
        total += v;
      }
      debug('total:', total);
    }, 10 * 1000);

    this.intermediateReporterInterval = driftless.setDriftlessInterval(() => {
      if (Object.keys(this.metricsByPeriod).length === 0) {
        return; // nothing received yet
      }

      // We always look at the earliest period available so that reports come in chronological order
      const earliestPeriodAvailable = Object.keys(this.metricsByPeriod)
        .filter((x) => this.periodsReportedFor.indexOf(x) === -1)
        .sort()[0];

      // TODO: better name. One above is earliestNotAlreadyReported
      const earliest = Object.keys(this.metricsByPeriod).sort()[0];
      if (this.periodsReportedFor.indexOf(earliest) > -1) {
        global.artillery.log(
          'Warning: multiple batches of metrics for period',
          earliest,
          new Date(Number(earliest))
        );
        delete this.metricsByPeriod[earliest]; // FIXME: need to merge them in for the final report
      }

      // We can process SQS messages in batches of 10 at a time, so
      // when there are more workers, we need to wait longer:
      const MAX_WAIT_FOR_PERIOD_MS =
        (Math.ceil(this.count / 10) * 2 + 20) * 1000;

      if (
        typeof earliestPeriodAvailable !== 'undefined' &&
        (this.metricsByPeriod[earliestPeriodAvailable].length === this.count ||
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
          this.metricsByPeriod[String(earliestPeriodAvailable)].length
        );

        // TODO: Track how many workers provided metrics in the metrics report
        const stats = global.artillery.__SSMS.mergeBuckets(
          this.metricsByPeriod[String(earliestPeriodAvailable)]
        )[String(earliestPeriodAvailable)];
        this.mergedPeriodMetrics.push(stats);
        // summarize histograms for console reporter
        stats.summaries = {};
        for (const [name, value] of Object.entries(stats.histograms || {})) {
          const summary = global.artillery.__SSMS.summarizeHistogram(value);
          stats.summaries[name] = summary;
          delete this.metricsByPeriod[String(earliestPeriodAvailable)];
        }

        this.periodsReportedFor.push(earliestPeriodAvailable);

        debug('Emitting stats event');
        this.emit('stats', stats);
      } else {
        debug('Waiting for more workerStats before emitting stats event');
      }
    }, 5 * 1000);

    this.workersDoneWatcher = driftless.setDriftlessInterval(() => {
      if (!this._allWorkersDone()) {
        return;
      }

      // Have we received and processed all intermediate metrics?
      if (Object.keys(this.metricsByPeriod).length > 0) {
        debug(
          'All workers done but still waiting on some intermediate reports'
        );
        return;
      }

      debug('ready to emit done event');
      debug('mergedPeriodMetrics');
      debug(this.mergedPeriodMetrics);

      // Merge by period, then compress and emit
      const stats = global.artillery.__SSMS.pack(this.mergedPeriodMetrics);
      stats.summaries = {};
      for (const [name, value] of Object.entries(stats.histograms || {})) {
        const summary = global.artillery.__SSMS.summarizeHistogram(value);
        stats.summaries[name] = summary;
      }

      if (process.env.DEBUG === 'sqs-reporter:v') {
        for (const [workerId, metrics] of Object.entries(
          this.metricsMessagesFromWorkers
        )) {
          debugV('worker', workerId, '->', metrics.length, 'items');
        }
        // fs.writeFileSync('worker-metrics-dump.json', JSON.stringify(self.metricsMessagesFromWorkers));
      }

      this.emit('done', stats);

      driftless.clearDriftless(this.intermediateReporterInterval);
      driftless.clearDriftless(this.workersDoneWatcher);
      driftless.clearDriftless(this.sqsDebugInterval);

      for (const sqsConsumer of this.sqsConsumers) {
        sqsConsumer.stop();
      }

      this.emit('workersDone', this.workerState);
    }, 5 * 1000);

    this.ee.on('message', (body, attrs) => {
      const workerId = attrs.workerId?.StringValue;

      if (!workerId) {
        debug('Got message with no workerId');
        debug(body);
        return;
      }
      if (body.event === 'workerDone' || body.event === 'workerError') {
        this.workerState[workerId] = body.event;
        this.emit(body.event, body, attrs);

        debug(workerId, body.event);
        return;
      }

      //TODO: this code is repeated from `launch-platform.js` - refactor later
      if (body.event === 'phaseStarted') {
        if (
          typeof this.phaseStartedEventsSeen[body.phase.index] === 'undefined'
        ) {
          this.phaseStartedEventsSeen[body.phase.index] = Date.now();
          this.emit(body.event, body.phase);
        }

        return;
      }

      //TODO: this code is repeated from `launch-platform.js` - refactor later
      if (body.event === 'phaseCompleted') {
        if (
          typeof this.phaseCompletedEventsSeen[body.phase.index] === 'undefined'
        ) {
          this.phaseCompletedEventsSeen[body.phase.index] = Date.now();
          this.emit(body.event, body.phase);
        }

        return;
      }

      // 'done' event is from SQS Plugin - unused for now
      if (body.event === 'done') {
        return;
      }

      if (body.msg) {
        this.emit('workerMessage', body, attrs);
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
        if (typeof this.metricsByPeriod[period] === 'undefined') {
          this.metricsByPeriod[period] = [];
        }
        this.metricsByPeriod[period].push(workerStats);

        if (process.env.DEBUG === 'sqs-reporter:v') {
          if (
            typeof this.metricsMessagesFromWorkers[workerId] === 'undefined'
          ) {
            this.metricsMessagesFromWorkers[workerId] = [];
          }
          this.metricsMessagesFromWorkers[workerId].push(workerStats);
        }

        debugV('metricsByPeriod:');
        debugV(this.metricsByPeriod);
        debug('number of periods processed');
        debug(Object.keys(this.metricsByPeriod));
        debug('number of metrics collections for period:', period, ':');
        debug(this.metricsByPeriod[period].length, 'expecting:', this.count);
      }
    });

    this.ee.on('messageReceiveTimeout', () => {
      // TODO: 10 polls with no results, e.g. if all workers crashed
    });

    const createConsumer = (i) => Consumer.create({
        queueUrl: process.env.SQS_QUEUE_URL || this.sqsQueueUrl,
        region: this.region,
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

          if (this.testId !== attrs.testId.StringValue) {
            throw new Error();
          }

          if (!this.messagesProcessed[i]) {
            this.messagesProcessed[i] = 0;
          }
          this.messagesProcessed[i] += 1;

          process.nextTick(() => {
            this.ee.emit('message', body, attrs);
          });
        }
      });

    this.sqsConsumers = [];
    for (let i = 0; i < this.poolSize; i++) {
      const sqsConsumer = createConsumer(i);

      sqsConsumer.on('error', (err) => {
        // TODO: Ignore "SQSError: SQS delete message failed:" errors
        if (err.message?.match(/ReceiptHandle.+expired/i)) {
          debug(err.name, err.message);
        } else {
          artillery.log(err);
          sqsConsumer.stop();
          this.emit('error', err);
        }
      });

      let empty = 0;
      sqsConsumer.on('empty', () => {
        empty++;
        if (empty > 10) {
          this.ee.emit('messageReceiveTimeout'); // TODO:
        }
      });
      sqsConsumer.start();

      this.sqsConsumers.push(sqsConsumer);
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
  const m = 10 ** decimals;
  return Math.round(number * m) / m;
}

module.exports = { SqsReporter };
