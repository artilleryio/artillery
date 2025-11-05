import * as EventEmitter from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as Core from '@artilleryio/int-core';

import { Command, flags } from '@oclif/command';
import { formatters, Plugin } from 'artillery-plugin-expect';
import * as gradientString from 'gradient-string';
import * as YAML from 'js-yaml';

import * as telemetry from '../telemetry';

class RunCommand extends Command {
  static aliases = ['test'];
  static strict = false;

  async runFlow(flowFilePath: string, opts: any) {
    const HttpEngine = Core.engine_http;
    const contents: any[] = YAML.loadAll(fs.readFileSync(flowFilePath, 'utf8'));

    const showHttpTimings =
      opts.showHTTPTimings || contents[0].http?.timings === true;

    let script: any;

    if (typeof contents[0].scenarios !== 'undefined') {
      // This is a classic Artillery script with config and scenario in the same file
      const target = contents[0].config?.target || opts.target;

      script = {
        config: {
          target,
          plugins: {
            expect: {
              formatter: 'silent',
              expectDefault200: true
            }
          }
        },
        scenarios: [contents[0].scenarios[0]]
      };
    } else {
      // This is a Skytrace scenario - just steps with metadata at the top
      script = {
        config: {
          target: contents[0].target,
          plugins: {
            expect: {
              formatter: 'silent',
              expectDefault200: true
            }
          }
        },
        scenarios: [
          {
            name: contents[0].name,
            flow: contents[1]
          }
        ]
      };
    }

    const events = new EventEmitter();
    process.env.LOCAL_WORKER_ID = '1337';
    const _plugin = new Plugin(script, events);
    const engine = new HttpEngine(script);
    const vu = promisify(engine.createScenario(script.scenarios[0], events));
    const initialContext = {
      vars: {
        target: script.config?.target || script.target,
        $environment: script._environment,
        $processEnvironment: process.env, // TODO: deprecate
        $env: process.env,
        $testRunId: global.artillery.testRunId
      }
    };

    events.on('error', (_errCode, _uuid) => {});
    events.on('trace:http:request', (_requestParams, _uuid) => {});
    events.on('trace:http:response', (_resp, _uuid) => {});
    events.on('trace:http:capture', (_result) => {});
    events.on(
      'plugin:expect:expectations',
      (expectations, req, res, userContext) => {
        formatters.pretty(expectations, req, res, userContext);
        if (showHttpTimings) {
          const phases = res?.timings?.phases;
          if (phases) {
            console.log();
            console.log(
              `  time: total=${phases.total} | dns=${phases.dns} | tcp=${
                phases.tcp
              } | ssl: ${phases.ssl || 'n/a'} | ttfb=${
                phases.firstByte
              } | download=${phases.download}`
            );
          }
        }
        console.log();
      }
    );

    try {
      const _context = await vu(initialContext);
    } catch (_vuErr) {
      // console.log(vuErr);
    }
  }

  async run() {
    const { flags, argv } = this.parse(RunCommand);
    const flowFilePaths = [path.resolve(process.cwd(), argv[0])];

    const banner = `    ───━━━★
SKYTRACE ──━━★
      ──━━★`;
    console.log(gradientString.vice(banner));
    console.log();

    const opts = { target: flags.target, showHTTPTimings: flags.timings };

    const ping = telemetry.init();
    await ping.capture('run-flow', {
      cliTarget: flags.target,
      cliHTTPTimings: flags.timings
    });

    if (flags.reload) {
      console.log('> Running flow (reload mode on)');
      console.log();
      this.runFlow(flowFilePaths[0], opts);
      let prevMtime = new Date(0);
      let rerunning = false;
      fs.watch(flowFilePaths[0], {}, (_eventType, fn) => {
        if (!fn) {
          return;
        }

        const stat = fs.statSync(fn);
        if (stat.mtime.valueOf() === prevMtime.valueOf()) {
          return;
        }

        if (rerunning) {
          return;
        }

        prevMtime = stat.mtime;
        rerunning = true;

        console.log();
        console.log('  --------------');
        console.log('> Rerunning flow');
        console.log(' ', new Date());
        console.log('  --------------');
        this.runFlow(flowFilePaths[0], opts);
        console.log();

        rerunning = false;
      });
    } else {
      console.log('> Running flow');
      // console.log('source:', flowFilePath);
      console.log('');
      await this.runFlow(flowFilePaths[0], opts);
    }

    await ping.shutdown();
  }
}

RunCommand.description = `Run flows`;
RunCommand.flags = {
  reload: flags.boolean({
    char: 'r',
    description: 'reload and rerun flow automatically'
  }),
  target: flags.string({
    char: 't',
    description: 'target endpoint, e.g. https://api.example-pet-store.com'
  }),
  timings: flags.boolean({
    description: 'show HTTP timing information for each request'
  })
};
RunCommand.args = [
  {
    name: 'file',
    required: true,
    description: 'Path to flow files'
  }
];

module.exports = { RunCommand };
