const { Command, flags } = require('@oclif/command');

const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const telemetry = require('../telemetry').init();

class ReportCommand extends Command {
  async run() {
    telemetry.capture('report generate');
    const { flags, args } = this.parse(ReportCommand);
    const output = flags.output || args.file + '.html'; // TODO: path.resolve
    const data = JSON.parse(fs.readFileSync(args.file, 'utf-8'));
    data.intermediate.forEach((o) => delete o.latencies); // TODO: still needed?
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
  output: flags.string({
    char: 'o',
    description: 'Write HTML report to specified location'
  })
};

ReportCommand.args = [
  {
    name: 'file',
    required: true
  }
];

module.exports = ReportCommand;
