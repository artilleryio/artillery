/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const debug = require('debug')('cloud');
const request = require('got');
const util = require('node:util');

class ArtilleryCloudPlugin {
  constructor(_script, _events) {
    if (typeof process.env.ARTILLERY_CLOUD_API_KEY === 'undefined') {
      return this;
    }

    this.pendingOps = 0;

    this.apiKey = process.env.ARTILLERY_CLOUD_API_KEY;
    this.baseUrl =
      process.env.ARTILLERY_CLOUD_ENDPOINT || 'https://app.artillery.io';
    this.eventsEndpoint = `${this.baseUrl}/api/events`;

    this.defaultHeaders = {
      'x-auth-token': this.apiKey
    };

    global.artillery.globalEvents.on('test:init', async (testInfo) => {
      debug('test:init', testInfo);

      this.testRunId = testInfo.testRunId;

      console.log('Artillery Cloud reporting is configured for this test run');
      console.log(`Run URL: ${this.baseUrl}/load-tests/${this.testRunId}`);

      try {
        await this._event('testrun:init', {});
      } catch (err) {
        console.log('Error: error sending test data to Artillery Cloud');
        console.log(err);
      }

      try {
        await this._event('testrun:changestatus', { status: 'INITIALIZING' });
        await this._event('testrun:addmetadata', {
          metadata: testInfo.metadata
        });
        await this._event('testrun:addnote', { text: testInfo.flags.note });
      } catch (err) {
        console.log('Error: error sending test data to Artillery Cloud');
        console.log('Test report may be incomplete');
        console.log(err);
      }
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

      await this._event('testrun:textlog', { lines: text, ts });

      debug('last 100 characters:');
      debug(text.slice(text.length - 100, text.length));
    });

    let testEndInfo;
    global.artillery.ext({
      ext: 'beforeExit',
      method: async ({ testInfo }) => {
        debug('beforeExit');
        testEndInfo = testInfo;
      }
    });

    // Send test end events just before the CLI shuts down. This ensures that all console
    // output has been captured and sent to the dashboard.
    global.artillery.ext({
      ext: 'onShutdown',
      method: async () => {
        try {
          await this._event('testrun:end', { ts: testEndInfo.endTime });
          await this._event('testrun:changestatus', { status: 'COMPLETED' });
        } catch (err) {
          console.log('Error: error sending test data to Artillery Cloud');
          console.log('Test report may be incomplete');
          console.log(err);
        }
      }
    });

    return this;
  }

  async _event(eventName, eventPayload) {
    await request
      .post(this.eventsEndpoint, {
        headers: this.defaultHeaders,
        json: {
          eventType: eventName,
          eventData: Object.assign({}, eventPayload, {
            testRunId: this.testRunId
          })
        }
      })
      .json();
  }

  cleanup(done) {
    debug('cleaning up');
    done(null);
  }
}

module.exports.Plugin = ArtilleryCloudPlugin;