const { Command, Flags, Args } = require('@oclif/core');

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const telemetry = require('../telemetry').init();

class ReportCommand extends Command {
  async run() {
    console.log(deprecationNotice);
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
\x1b[34m┌───────────────────────────────────────────────────────────────────────┐
│                          \x1b[33mDEPRECATION NOTICE                           \x1b[34m│
├───────────────────────────────────────────────────────────────────────┤
│ \x1b[0m\x1b[33mThe "report" command is deprecated and will be removed in a future\x1b[0m    \x1b[34m│
│ \x1b[0m\x1b[33mrelease of Artillery.\x1b[0m                                                 \x1b[34m│
│                                                                       │
│ \x1b[0m\x1b[37m\x1b[94mArtillery Cloud\x1b[0m is now the recommended way to visualize test results. \x1b[0m\x1b[34m│
│ \x1b[0m\x1b[37mIt provides more comprehensive reporting, advanced visualizations,\x1b[0m    \x1b[34m│
│ \x1b[0m\x1b[37mand includes a free tier.                         \x1b[0m                    \x1b[34m│
│                                                                       │
│ \x1b[0m\x1b[37mSign up on \x1b[0m \x1b[4m\x1b[36mhttps://artillery.io/cloud\x1b[24m                                \x1b[34m│
└───────────────────────────────────────────────────────────────────────┘
\x1b[0m`;

ReportCommand.args = { file: Args.string() };

module.exports = ReportCommand;
