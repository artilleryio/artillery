'use strict';

const debug = require('debug')('plugin:slack');
const got = require('got');
const moment = require('moment');

class SlackPlugin {
  constructor(script, events) {
    this.script = script;
    this.events = events;

    if (process.env.LOCAL_WORKER_ID || process.env.WORKER_ID) {
      debug('Running in a worker, exiting');
      return;
    }

    this.config = script.config.plugins.slack || {};
    this.webhook = this.config.webhookUrl;

    if (!this.config.webhookUrl) {
      throw new SlackPluginError('Slack webhook URL not provided');
    }

    if (global.artillery && global.artillery.cloudEnabled) {
      debug('Artillery Cloud enabled, configuring Run URL');
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
        debug('Sorting and formatting ensure checks');
        checkTests
          .sort((a, b) => (a.result < b.result ? 1 : -1))
          .forEach((check) => {
            this.ensureChecks.total += 1;
            if (check.result !== 1) {
              if (check.strict) {
                this.exitCode = 1;
              }
              this.ensureChecks.failed += 1;
              this.ensureChecks.checkList.push({
                text: check.original,
                passed: false,
                optional: !check.strict
              });
            } else {
              this.ensureChecks.passed += 1;
              this.ensureChecks.checkList.push({
                text: check.original,
                passed: true,
                optional: false
              });
            }
          });

        // When ensure is enabled, whether the beforeExit or the checks event will be triggered first will depend on the order of plugins in the test script
        // Since we need data from both events, first event triggered will store the data and the second event will send the report
        if (
          this.exitCode !== undefined &&
          this.exitCode !== null &&
          this.report &&
          !this.reportSent
        ) {
          debug('Sending report from checks event');
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
          debug('Sending report from beforeExit event');
          await this.sendReport(opts.report, this.ensureChecks);
          this.reportSent = true;
        }
      }
    });

    debug('Slack plugin initialised!');
  }

  getErrors(report) {
    const errorList = [];
    for (const [key, value] of Object.entries(report.counters).filter(([key]) =>
      key.startsWith('errors.')
    )) {
      errorList.push(`❌ ${key.replace('errors.', '')} (${value})`);
    }
    return errorList;
  }

  assembleSlackPayload(report, ensureChecks) {
    const errorList = this.getErrors(report);
    const duration = report.lastMetricAt - report.firstMetricAt;
    const headerText =
      this.exitCode === 0
        ? '🟢 Artillery test run finished'
        : '🔴 Artillery test run failed';

    const payloadTemplate = {
      text: headerText,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: headerText,
            emoji: true
          }
        }
      ]
    };

    let errorsText = '*Errors*\nNone';

    if (errorList.length > 0) {
      // Only show first 10 errors to avoid Slack message length limit
      const maxErrors = 10;
      const trimmedList = errorList.slice(0, maxErrors);

      if (errorList.length > maxErrors) {
        trimmedList.push(`➕ ${errorList.length - maxErrors} more…`);
      }

      errorsText = `*Errors (${errorList.length})*\n\`\`\`\n${trimmedList.join(
        '\n'
      )}\n\`\`\``;
    }

    const metricBlocks = [
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*VUs*\n${report.counters['vusers.completed']} completed / ${report.counters['vusers.created']} created`
          },
          {
            type: 'mrkdwn',
            text: `*Duration*\n${this.formatDuration(duration)}`
          }
        ]
      }
    ];

    let checksText = '*Checks*\nNone defined';

    if (this.ensureChecks) {
      // Show summary if more than 10 checks to avoid Slack message length limit
      if (this.ensureChecks.total > 10) {
        let summaryText = '';

        if (ensureChecks.passed > 0) {
          summaryText += `🟢 ${ensureChecks.passed} checks passed\n`;
        }

        if (ensureChecks.failed > 0) {
          summaryText += `🔴 ${ensureChecks.failed} checks failed`;
        }

        summaryText = summaryText.trim();
        checksText = `*Checks (${ensureChecks.passed}/${ensureChecks.total})*\n\`\`\`\n${summaryText}\n\`\`\``;
      } else {
        const formattedChecks = this.ensureChecks.checkList.map(
          (check) =>
            `${check.passed ? '🟢' : '🔴'} ${check.text}${
              check.optional ? ' (optional)' : ''
            }`
        );

        checksText = `*Checks (${ensureChecks.passed} / ${
          ensureChecks.total
        })*\n\`\`\`\n${formattedChecks.join('\n')}\n\`\`\``;
      }
    }

    metricBlocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: checksText
        },
        {
          type: 'mrkdwn',
          text: errorsText
        }
      ]
    });

    payloadTemplate.blocks = payloadTemplate.blocks.concat(metricBlocks);

    if (this.cloudEnabled) {
      payloadTemplate.blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'See report on Artillery Cloud',
              emoji: true
            },
            url: this.cloudTestRunUrl,
            style: 'primary'
          }
        ]
      });
    }

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

  formatDuration(durationInMs) {
    const duration = moment.duration(durationInMs);
    if (durationInMs < 1000) {
      return `${durationInMs} miliseconds`;
    }
    const miliseconds = duration.get('millisecond');
    const timeComponents = ['day', 'hour', 'minute', 'second'];
    const formatedTimeComponents = timeComponents
      .map((component) => {
        let value = duration.get(component);
        if (component === 'second' && miliseconds) {
          value += 1;
        }
        return value
          ? `${value} ${value === 1 ? component : component + 's'}`
          : '';
      })
      .filter((component) => !!component);

    const lastComponent = formatedTimeComponents.pop();
    return formatedTimeComponents.length
      ? formatedTimeComponents.join(', ') + ' and ' + lastComponent
      : lastComponent;
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
