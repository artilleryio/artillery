/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('cloud');
const request = require('got');
const awaitOnEE = require('../../util/await-on-ee');
const sleep = require('../../util/sleep');
const util = require('node:util');

class ArtilleryCloudPlugin {
  constructor(_script, _events, { flags }) {
    if (!flags.record) {
      return this;
    }

    this.apiKey = flags.key || process.env.ARTILLERY_CLOUD_API_KEY;

    if (!this.apiKey) {
      console.log(
        'An API key is required to record test results to Artillery Cloud. See https://docs.art/get-started-cloud for more information.'
      );
      return;
    }

    this.baseUrl =
      process.env.ARTILLERY_CLOUD_ENDPOINT || 'https://app.artillery.io';
    this.eventsEndpoint = `${this.baseUrl}/api/events`;

    this.defaultHeaders = {
      'x-auth-token': this.apiKey
    };
    this.unprocessedLogsCounter = 0;
    this.cancellationRequestedBy = '';

    let testEndInfo = {};
    global.artillery.globalEvents.on('test:init', async (testInfo) => {
      debug('test:init', testInfo);

      this.testRunId = testInfo.testRunId;
      const testRunUrl = `${this.baseUrl}/load-tests/${this.testRunId}`;
      testEndInfo.testRunUrl = testRunUrl;

      this.getLoadTestEndpoint = `${this.baseUrl}/api/load-tests/${this.testRunId}/status`;

      console.log('Artillery Cloud reporting is configured for this test run');
      console.log(`Run URL: ${testRunUrl}`);

      await this._event('testrun:init', {
        metadata: testInfo.metadata
      });
      this.setGetLoadTestInterval = this.setGetStatusInterval();

      if (typeof testInfo.flags.note !== 'undefined') {
        await this._event('testrun:addnote', { text: testInfo.flags.note });
      }
    });

    global.artillery.globalEvents.on('phaseStarted', async (phase) => {
      await this._event('testrun:event', {
        eventName: 'phaseStarted',
        eventAttributes: phase
      });
    });

    global.artillery.globalEvents.on('phaseCompleted', async (phase) => {
      await this._event('testrun:event', {
        eventName: 'phaseCompleted',
        eventAttributes: phase
      });
    });

    global.artillery.globalEvents.on('stats', async (report) => {
      debug('stats', new Date());
      const ts = Number(report.period);
      await this._event('testrun:metrics', { report, ts });
    });

    global.artillery.globalEvents.on('done', async (report) => {
      debug('done');
      debug(
        'testrun:aggregatereport: payload size:',
        JSON.stringify(report).length
      );
      await this._event('testrun:aggregatereport', { aggregate: report });
    });

    global.artillery.globalEvents.on('checks', async (checks) => {
      debug('checks');
      await this._event('testrun:checks', { checks });
    });

    global.artillery.globalEvents.on('logLines', async (lines, ts) => {
      debug('logLines event', ts);
      this.unprocessedLogsCounter += 1;

      let text = '';

      try {
        JSON.stringify(lines);
      } catch (stringifyErr) {
        console.log('Could not serialize console log');
        console.log(stringifyErr);
      }
      for (const args of lines) {
        text += util.format(...Object.keys(args).map((k) => args[k])) + '\n';
      }

      try {
        await this._event('testrun:textlog', { lines: text, ts });
      } catch (err) {
        debug(err);
      } finally {
        this.unprocessedLogsCounter -= 1;
      }

      debug('last 100 characters:');
      debug(text.slice(text.length - 100, text.length));
    });

    global.artillery.globalEvents.on('metadata', async (metadata) => {
      await this._event('testrun:addmetadata', {
        metadata
      });
    });

    global.artillery.ext({
      ext: 'beforeExit',
      method: async ({ testInfo, report }) => {
        debug('beforeExit');
        testEndInfo = {
          ...testEndInfo,
          ...testInfo,
          report
        };
      }
    });

    // Send test end events just before the CLI shuts down. This ensures that all console
    // output has been captured and sent to the dashboard.
    global.artillery.ext({
      ext: 'onShutdown',
      method: async (opts) => {
        clearInterval(this.setGetLoadTestInterval);
        // Wait for the last logLines events to be processed, as they can sometimes finish processing after shutdown has finished
        await awaitOnEE(
          global.artillery.globalEvents,
          'logLines',
          200,
          1 * 1000 //wait at most 1 second for a final log lines event emitter to be fired
        );
        await this.waitOnUnprocessedLogs(2 * 1000); //just waiting for ee is not enough, as the api call takes time

        await this._event('testrun:end', {
          ts: testEndInfo.endTime,
          exitCode: global.artillery.suggestedExitCode || opts.exitCode,
          isEarlyStop: !!opts.earlyStop,
          report: testEndInfo.report
        });

        console.log('\n');
        if (this.cancellationRequestedBy) {
          console.log(`Test run stopped by ${this.cancellationRequestedBy}.`);
        }
        console.log(`Run URL: ${testEndInfo.testRunUrl}`);
      }
    });

    return this;
  }

  async waitOnUnprocessedLogs(maxWaitTime) {
    let waitedTime = 0;
    while (this.unprocessedLogsCounter > 0 && waitedTime < maxWaitTime) {
      debug('waiting on unprocessed logs');
      await sleep(500);
      waitedTime += 500;
    }
    return true;
  }

  setGetStatusInterval() {
    const interval = setInterval(async () => {
      if (this.cancellationRequestedBy) {
        return;
      }
      const res = await this._getLoadTestStatus();

      if (!res) {
        debug('No response from Artillery Cloud get status');
        return;
      }

      if (res.status != 'CANCELLATION_REQUESTED') {
        return;
      }

      console.log(
        `WARNING: Artillery Cloud user ${res.cancelledBy} requested to stop the test. Stopping test run - this may take a few seconds.`
      );
      this.cancellationRequestedBy = res.cancelledBy;
      global.artillery.suggestedExitCode = 8;
      await global.artillery.shutdown({ earlyStop: true });
    }, 5000);

    return interval;
  }

  async _getLoadTestStatus() {
    debug('☁️', 'Getting load test status');

    try {
      const res = await request.get(this.getLoadTestEndpoint, {
        headers: this.defaultHeaders,
        throwHttpErrors: false
      });

      return JSON.parse(res.body);
    } catch (error) {
      debug(error);
    }
  }

  async _event(eventName, eventPayload) {
    debug('☁️', eventName, eventPayload);

    try {
      const res = await request.post(this.eventsEndpoint, {
        headers: this.defaultHeaders,
        json: {
          eventType: eventName,
          eventData: Object.assign({}, eventPayload, {
            testRunId: this.testRunId
          })
        },
        throwHttpErrors: false,
        retry: {
          limit: 2,
          methods: ['POST']
        }
      });

      if (res.statusCode != 200) {
        if (res.statusCode == 401) {
          console.log(
            'Error: API key is invalid. Could not send test data to Artillery Cloud.'
          );
        } else {
          console.log('Error: error sending test data to Artillery Cloud');
          console.log('Test report may be incomplete');
        }
        let body;
        try {
          body = JSON.parse(res.body);
        } catch (_err) {}

        if (body && body.requestId) {
          console.log('Request ID:', body.requestId);
        }
      }
      debug('☁️', eventName, 'sent');
    } catch (err) {
      debug(err);
    }
  }

  cleanup(done) {
    debug('cleaning up');
    done(null);
  }
}

module.exports.Plugin = ArtilleryCloudPlugin;
