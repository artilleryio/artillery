const { Command, flags } = require('@oclif/command');

const telemetry = require('../../telemetry').init();

const { Plugin: CloudPlugin } = require('../../platform/cloud/cloud');

var tryRequire = require('try-require');
const Pro = tryRequire('artillery-pro');

class RunCommand extends Command {
  static aliases = ['run-test', 'run-cluster', 'run:fargate'];
  // Enable multiple args:
  static strict = false;

  async run() {
    if (!Pro) {
      console.error(
        'Error: This command requires artillery-pro to be installed\n'
      );
      console.error(
        'https://www.artillery.io/docs/guides/getting-started/installing-artillery-pro'
      );
      process.exit(1);
    }

    const { flags, _argv, args } = this.parse(RunCommand);
    new CloudPlugin(null, null, { flags });
    Pro.commands.runCluster(args.script, flags);
  }
}

if (Pro) {
  RunCommand.description = Pro.oclif.runTest.description;
  RunCommand.flags = Pro.oclif.runTest.flags;
  RunCommand.args = Pro.oclif.runTest.args;
} else {
  RunCommand.description = 'this command requires artillery-pro';
}

module.exports = RunCommand;
