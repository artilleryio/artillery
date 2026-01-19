const { Command, Flags, Args } = require('@oclif/core');

const chalk = require('chalk');

class ReportCommand extends Command {
  async run() {
    console.error(deprecationNotice);
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
┌───────────────────────────────────────────────────────────────────────┐
|  ${chalk.blue(
  'The "report" command has been deprecated and is no longer supported'
)}  |
|                                                                       |
|  You can use Artillery Cloud (https://app.artillery.io) to visualize  |
|  test results, create custom reports, and share them with your team.  |
└───────────────────────────────────────────────────────────────────────┘
`;

ReportCommand.args = { file: Args.string() };

module.exports = ReportCommand;
