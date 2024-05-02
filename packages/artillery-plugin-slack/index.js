'use strict';

const debug = require('debug')('plugin:slack');
const got = require('got');

class SlackPlugin {
  constructor(script, events) {
    this.script = script;
    this.events = events;

    if (process.env.LOCAL_WORKER_ID) {
      debug('Running in a worker, exiting');
      return;
    }

    this.config = script.config.plugins.slack || {};
    this.webhook = this.config.webhookUrl;

    if (!this.config.webhookUrl) {
      throw new SlackPluginError('Slack webhook URL not provided');
    }

    if (global.artillery && global.artillery.cloudEnabled) {
      this.cloudEnabled = true;
      const baseUrl =
        process.env.ARTILLERY_CLOUD_ENDPOINT || 'https://app.artillery.io';
      this.cloudTestRunUrl = `${baseUrl}/load-tests/${global.artillery.testRunId}`;
    }

    if (
      this.script.config.plugins.ensure &&
      Object.keys(this.script.config.plugins.ensure).length > 0
    ) {
      this.ensureEnabled = true;

      global.artillery.globalEvents.on('checks', async (checkTests) => {
        this.ensureChecks = {
          failed: 0,
          total: 0,
          passed: 0,
          checkList: []
        };

        checkTests
          .sort((a, b) => (a.result < b.result ? 1 : -1))
          .forEach((check) => {
            this.ensureChecks.total += 1;
            if (check.result !== 1) {
              this.ensureChecks.failed += 1;
              this.ensureChecks.checkList.push(
                `🔴 ${check.original} ${check.strict ? '' : '(optional) '}`
              );
            } else {
              this.ensureChecks.passed += 1;
              this.ensureChecks.checkList.push(`🟢 ${check.original}`);
            }
          });

        // When ensure is enabled, whether the beforeExit or the checks event will be triggered first will depend on the order of plugins in the test script
        // Since we need data from both events, first event triggered will store the data and the second event will send the report
        if (this.exitCode !== undefined && this.report && !this.reportSent) {
          await this.sendReport(this.report, this.ensureChecks);
          this.reportSent = true;
        }
      });
    }

    global.artillery.ext({
      ext: 'beforeExit',
      method: async (opts) => {
        this.exitCode = global.artillery.suggestedExitCode || opts.exitCode;
        if (this.ensureEnabled && !this.ensureChecks && !this.reportSent) {
          this.report = opts.report;
        } else {
          await this.sendReport(opts.report, this.ensureChecks);
          this.reportSent = true;
        }
      }
    });

    debug('Slack plugin initialised!');
  }

  getErrors(report) {
    const errorList = [];
    for (const [key, value] of Object.entries(report.counters).filter(
      ([key, value]) => key.startsWith('errors.')
    )) {
      errorList.push(` ◌ ${key.replace('errors.', '')}:  ${value}`);
    }
    return errorList;
  }

  assembleSlackPayload(report, ensureChecks) {
    const errorList = this.getErrors(report);
    const passed =
      this.exitCode === 0 && !this.ensureChecks?.failedChecks?.length > 0
        ? true
        : false;
    const introText = passed
      ? ':white_check_mark: Artillery test run finished'
      : ':no_entry: Artillery test run failed';

    const payloadTemplate = {
      text: introText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'plain_text',
            text: introText
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Test run id:* `' + `${global.artillery.testRunId}` + '`'
          }
        }
      ]
    };

    if (this.cloudEnabled) {
      payloadTemplate.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${this.cloudTestRunUrl}|View in Artillery Cloud>`
        }
      });
    }

    const metricBlocks = [
      {
        type: 'divider'
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*${report.counters['vusers.completed']} / ${report.counters['vusers.created']}*\nVUs completed / created`
          },
          {
            type: 'mrkdwn',
            text: `*Errors*\n${
              errorList.length !== 0 ? errorList.join('\n') : '0'
            }`
          }
        ]
      },
      {
        type: 'divider'
      }
    ];

    if (this.ensureChecks) {
      metricBlocks.push(
        ...[
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Checks (${ensureChecks.passed} / ${
                  ensureChecks.total
                })*\n${this.ensureChecks.checkList.join('\n')}`
              }
            ]
          },
          {
            type: 'divider'
          }
        ]
      );
    }

    payloadTemplate.blocks = payloadTemplate.blocks.concat(metricBlocks);

    return JSON.stringify(payloadTemplate);
  }

  async sendReport(report, ensureChecks) {
    const payload = this.assembleSlackPayload(report, ensureChecks);
    try {
      const res = await got.post(this.config.webhookUrl, {
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload
      });
      debug('Slack response:', res.status, res.statusText);
      this.finished = true;
    } catch (err) {
      this.finished = true;
      console.error(`Slack Plugin: Failed to send report to Slack: ${err}`);
    }
  }

  async cleanup(done) {
    debug('Cleaning up');
    done();
  }
}

class SlackPluginError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SlackPluginError';
  }
}

module.exports = {
  Plugin: SlackPlugin,
  LEGACY_METRICS_FORMAT: false
};
