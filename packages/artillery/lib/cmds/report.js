const { Command, Flags, Args } = require('@oclif/core');

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const telemetry = require('../telemetry').init();
const chalk = require('chalk');

class ReportCommand extends Command {
  async run() {
    console.error(deprecationNotice);
    telemetry.capture('report generate');
    const { flags, args } = await this.parse(ReportCommand);
    const output = flags.output || args.file + '.html'; // TODO: path.resolve
    const data = JSON.parse(fs.readFileSync(args.file, 'utf-8'));
    data.intermediate.forEach((o) => delete o.latencies); // TODO: still needed?
    data.name = args.file.match(/([^\/]*)$/)[0];
    const templateFn = path.join(
      path.dirname(__filename),
      '../report/index.html.ejs'
    );
    const template = fs.readFileSync(templateFn, 'utf-8');
    const compiledTemplate = _.template(template);
    const html = compiledTemplate({ report: JSON.stringify(data, null, 2) });
    fs.writeFileSync(output, html, { encoding: 'utf-8', flag: 'w' });
    console.log('Report generated: %s', output);
  }
}

ReportCommand.description =
  'generate a HTML report from a JSON log produced with artillery run';

ReportCommand.flags = {
  output: Flags.string({
    char: 'o',
    description: 'Write HTML report to specified location'
  })
};

const deprecationNotice = `
${chalk.blue(`┌───────────────────────────────────────────────────────────────────────┐
│`)}                          ${chalk.yellow(
  'DEPRECATION NOTICE'
)}                           ${chalk.blue(`│
├───────────────────────────────────────────────────────────────────────┤
│`)} ${chalk.yellow(
  'The "report" command is deprecated and will be removed in a future'
)}    ${chalk.blue(`│
│`)} ${chalk.yellow(
  'release of Artillery.'
)}                                                 ${chalk.blue(`│
│                                                                       │
│`)} ${chalk.blueBright('Artillery Cloud')} ${chalk.white(
  'is now the recommended way to visualize test results.'
)} ${chalk.blue(`│
│`)} ${chalk.white(
  'It provides more comprehensive reporting, advanced visualizations,'
)}    ${chalk.blue(`│
│`)} ${chalk.white(
  'and includes a free tier.'
)}                                             ${chalk.blue(`│
│                                                                       │
│`)} ${chalk.white('Sign up on')} ${chalk.cyan(
  chalk.underline('https://app.artillery.io')
)}                                 ${chalk.blue(`│
└───────────────────────────────────────────────────────────────────────┘
`)}`;

ReportCommand.args = { file: Args.string() };

module.exports = ReportCommand;
