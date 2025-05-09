/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('cloud');
const request = require('got');
const awaitOnEE = require('../../util/await-on-ee');
const sleep = require('../../util/sleep');
const util = require('node:util');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { isCI, name: ciName, GITHUB_ACTIONS } = require('ci-info');

class ArtilleryCloudPlugin {
  constructor(_script, _events, { flags }) {
    this.enabled = false;

    const isInteractiveUse = typeof flags.record !== 'undefined';
    const enabledInCloudWorker =
      typeof process.env.WORKER_ID !== 'undefined' &&
      typeof process.env.ARTILLERY_CLOUD_API_KEY !== 'undefined';

    if (!isInteractiveUse && !enabledInCloudWorker) {
      return this;
    }

    this.enabled = true;

    this.apiKey = flags.key || process.env.ARTILLERY_CLOUD_API_KEY;

    this.baseUrl =
      process.env.ARTILLERY_CLOUD_ENDPOINT || 'https://app.artillery.io';
    this.eventsEndpoint = `${this.baseUrl}/api/events`;
    this.whoamiEndpoint = `${this.baseUrl}/api/user/whoami`;
    this.getAssetUploadUrls = `${this.baseUrl}/api/asset-upload-urls`;
    this.pingEndpoint = `${this.baseUrl}/api/ping`;

    this.defaultHeaders = {
      'x-auth-token': this.apiKey
    };
    this.unprocessedLogsCounter = 0;
    this.cancellationRequestedBy = '';

    let testEndInfo = {};

    // This value is available in cloud workers only. With interactive use, it'll be set
    // in the test:init event handler.
    this.testRunId = process.env.ARTILLERY_TEST_RUN_ID;

    if (isInteractiveUse) {
      global.artillery.globalEvents.on('test:init', async (testInfo) => {
        debug('test:init', testInfo);

        this.testRunId = testInfo.testRunId;

        const testRunUrl = `${this.baseUrl}/${this.orgId}/load-tests/${global.artillery.testRunId}`;
        testEndInfo.testRunUrl = testRunUrl;

        this.getLoadTestEndpoint = `${this.baseUrl}/api/load-tests/${this.testRunId}/status`;

        let ciURL = null;
        if (isCI && GITHUB_ACTIONS) {
          const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } =
            process.env;
          if (GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID) {
            ciURL = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
          }
        }

        const metadata = Object.assign({}, testInfo.metadata, {
          isCI,
          ciName,
          ciURL
        });

        await this._event('testrun:init', {
          metadata: metadata
        });
        this.setGetLoadTestInterval = this.setGetStatusInterval();

        if (typeof testInfo.flags.note !== 'undefined') {
          await this._event('testrun:addnote', { text: testInfo.flags.note });
        }

        this.uploading = 0;
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
    } // isInteractiveUse

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
        if (!this.enabled || this.off) {
          return;
        }

        if (isInteractiveUse) {
          clearInterval(this.setGetLoadTestInterval);

          // Wait for the last logLines events to be processed, as they can sometimes finish processing after shutdown has finished
          await awaitOnEE(
            global.artillery.globalEvents,
            'logLines',
            200,
            1 * 1000 //wait at most 1 second for a final log lines event emitter to be fired
          );
        }

        await this.waitOnUnprocessedLogs(5 * 60 * 1000); //just waiting for ee is not enough, as the api call takes time

        if (isInteractiveUse) {
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
      }
    });

    return this;
  }

  async init() {
    if (!this.apiKey) {
      const err = new Error();
      err.name = 'CloudAPIKeyMissing';
      this.off = true;
      throw err;
    }

    let res;
    let body;
    try {
      res = await request.get(this.whoamiEndpoint, {
        headers: this.defaultHeaders,
        throwHttpErrors: false,
        retry: {
          limit: 0
        }
      });

      body = JSON.parse(res.body);
      debug(res.body);
      this.orgId = body.activeOrg;
    } catch (err) {
      this.off = true;
      throw err;
    }

    if (res.statusCode === 401) {
      const err = new Error();
      err.name = 'APIKeyUnauthorized';
      this.off = true;
      throw err;
    }

    let postSucceeded = false;
    try {
      res = await request.post(this.pingEndpoint, {
        headers: this.defaultHeaders,
        throwHttpErrors: false,
        retry: {
          limit: 3
        }
      });

      if (res.statusCode === 200) {
        postSucceeded = true;
      }
    } catch (err) {
      this.off = true;
    }

    if (!postSucceeded) {
      const err = new Error();
      err.name = 'PingFailed';
      this.off = true;
      throw err;
    }

    console.log('Artillery Cloud reporting is configured for this test run');
    console.log(
      `Run URL: ${this.baseUrl}/${this.orgId}/load-tests/${global.artillery.testRunId}`
    );

    this.user = {
      id: body.id,
      email: body.email
    };

    const outputDir =
      process.env.PLAYWRIGHT_TRACING_OUTPUT_DIR ||
      `/tmp/${global.artillery.testRunId}/`;

    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (_err) {}

    const watcher = chokidar.watch(outputDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignorePermissionErrors: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500
      }
    });

    watcher.on('add', (fp) => {
      if (path.basename(fp).startsWith('trace-') && fp.endsWith('.zip')) {
        this.uploading++;
        this._uploadAsset(fp);
      }
    });
  }

  async _uploadAsset(localFilename) {
    const payload = {
      testRunId: this.testRunId,
      filenames: [path.basename(localFilename)]
    };

    debug(payload);

    let url;
    try {
      const res = await request.post(this.getAssetUploadUrls, {
        headers: this.defaultHeaders,
        throwHttpErrors: false,
        json: payload
      });

      const body = JSON.parse(res.body);
      debug(body);

      url = body.urls[path.basename(localFilename)];
    } catch (err) {
      debug(err);
    }

    if (!url) {
      return;
    }

    const fileStream = fs.createReadStream(localFilename);
    try {
      const _response = await request.put(url, {
        body: fileStream
      });
    } catch (error) {
      console.error('Failed to upload Playwright trace recording:', error);
      console.log(error.code, error.name, error.message, error.stack);
    } finally {
      this.uploading--;
      artillery.globalEvents.emit('counter', 'browser.traces.uploaded', 1);
      try {
        fs.unlinkSync(localFilename);
      } catch (err) {
        debug(err);
      }
    }
  }

  async waitOnUnprocessedLogs(maxWaitTime) {
    let waitedTime = 0;
    while (
      (this.unprocessedLogsCounter > 0 || this.uploading > 0) &&
      waitedTime < maxWaitTime
    ) {
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
