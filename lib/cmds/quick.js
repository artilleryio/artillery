/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const RunCommand = require('./run');
const parse = require('url').parse;
const fs = require('fs');
const _ = require('lodash');
const tmp = require('tmp');
const debug = require('debug')('commands:quick');

const { Command, flags } = require('@oclif/command');

class QuickCommand extends Command {
  async run() {
    const { flags, argv, args } = this.parse(QuickCommand);
    const arrivalCount = flags.count;
    const url = args.target;

    const script = {
      config: {
        target: '',
        phases: [],
        mode: 'uniform',
        __createdByQuickCommand: true
      },
      scenarios: [
        {
          flow: []
        }
      ]
    };

    const p = parse(url);
    const target = p.protocol + '//' + p.host;
    script.config.target = target;

    if (flags.insecure && p.protocol.match(/https/)) {
      script.config.tls = {
        rejectUnauthorized: false
      };
    }

    script.config.phases.push({
      duration: 1,
      arrivalCount: flags.count
    });

    let requestSpec = {};
    if (p.protocol.match('http')) {
      requestSpec.get = { url: url };
    } else if (p.protocol.match('ws')) {
      requestSpec.send = 'hello from Artillery!';
    } else {
      console.error('Unknown protocol in target:', args.target);
      console.error('Supported protocols: HTTP(S) and WS(S)');
      process.exit(1);
    }

    if (flags.num > 1) {
      requestSpec = {
        loop: [requestSpec],
        count: flags.num
      };
    }

    script.scenarios[0].flow.push(requestSpec);
    if (p.protocol.match(/ws/)) {
      script.scenarios[0].engine = 'ws';
    }

    const tmpf = tmp.fileSync();
    fs.writeFileSync(tmpf.name, JSON.stringify(script, null, 2), { flag: 'w' });

    const runArgs = [];
    if (flags.output) {
      runArgs.push('--output');
      runArgs.push(flags.output);
    }
    if (flags.quiet) {
      runArgs.push('--quiet');
    }

    runArgs.push(`${tmpf.name}`);

    RunCommand.run(runArgs);
  }
}

QuickCommand.description = 'run a simple test without writing a test script';
QuickCommand.flags = {
  count: flags.string({
    char: 'c',
    description: 'Number of VUs to create',
    parse: (input) => parseInt(input, 10),
    default: 10
  }),
  num: flags.string({
    char: 'n',
    description: 'Number of requests/messages that each VU will send',
    parse: (input) => parseInt(input, 10),
    default: 10
  }),
  output: flags.string({
    char: 'o',
    description: 'Filename of the JSON report'
  }),
  insecure: flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections'
  }),
  quiet: flags.boolean({
    char: 'q',
    description: 'Quiet mode'
  })
};
QuickCommand.args = [
  {
    name: 'target',
    required: 'true'
  }
];

module.exports = QuickCommand;
