/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Command, Flags, Args } = require('@oclif/core');
const telemetry = require('../telemetry').init();
const { Plugin: CloudPlugin } = require('../platform/cloud/cloud');

const tryRequire = require('try-require');
const PlatformFargateLegacy = tryRequire('@artilleryio/platform-fargate');
const PlatformECS = require('../platform/aws-ecs/ecs');
const { ECS_WORKER_ROLE_NAME } = require('../platform/aws/constants');

class RunCommand extends Command {
  static aliases = ['run:fargate'];
  // Enable multiple args:
  static strict = false;

  async run() {
    const { flags, _argv, args } = await this.parse(RunCommand);
    new CloudPlugin(null, null, { flags });

    const ECS = new PlatformECS(null, null, {}, { testRunId: 'foo' });
    await ECS.init();

    flags.taskRoleName = ECS_WORKER_ROLE_NAME;
    process.env.USE_NOOP_BACKEND_STORE = 'true';

    flags.region = flags.region || 'us-east-1';

    telemetry.capture('run:fargate', {
      region: flags.region,
      count: flags.count
    });

    // Delegate the rest to existing implementation:
    PlatformFargateLegacy.commands.runCluster(args.script, flags);
  }
}

if (PlatformFargateLegacy) {
  RunCommand.description = PlatformFargateLegacy.oclif.runTest.description;
  RunCommand.flags = PlatformFargateLegacy.oclif.runTest.flags;
  RunCommand.args = PlatformFargateLegacy.oclif.runTest.args;
}

module.exports = RunCommand;
