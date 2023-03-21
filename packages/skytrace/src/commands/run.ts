import * as Core from '@artilleryio/int-core';

import * as EventEmitter from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { Command, flags } from '@oclif/command';
import * as YAML from 'js-yaml';

import { Plugin, formatters } from 'artillery-plugin-expect';

import * as gradientString from 'gradient-string';

class RunCommand extends Command {
  static aliases = [ 'test' ];
  static strict = false;

  async runFlow(flowFilePath: string) {
    const HttpEngine = Core.engine_http;
    const contents: any[] = YAML.loadAll(fs.readFileSync(flowFilePath, 'utf8'));

    const showHttpTimings = (contents[0].http?.timings === true);

    let script;
    if (typeof contents[0]['config']?.target !== 'undefined' && typeof contents[0]['scenarios'] !== 'undefined') {
      script = {
        config: {
          target: contents[0]['config'].target,
          plugins: {
            expect: {
              formatter: 'silent',
              expectDefault200: true
            }
          },
        },
        scenarios: [
            contents[0]['scenarios'][0]
          ]
        };
    } else {
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
        scenarios: [{
          name:  contents[0].name,
          flow: contents[1],
        }]
      };
    }

    const events = new EventEmitter();
    process.env.LOCAL_WORKER_ID = '1337';
    const plugin = new Plugin(script, events);
    const engine = new HttpEngine(script);
    const vu = promisify(engine.createScenario(script.scenarios[0], events));
    const initialContext = {
      vars: {}
    };

    events.on('error', (errCode, uuid) => {});
    events.on('trace:http:request', (requestParams, uuid) => {
    });
    events.on('trace:http:response', (resp, uuid) => {
    });
    events.on('trace:http:capture', (result) => {
    });
    events.on('plugin:expect:expectations', (expectations, req, res, userContext) => {
      formatters.pretty(expectations, req, res, userContext);
      if (showHttpTimings) {
        const phases = res?.timings?.phases;
        if (phases) {
          console.log();
          console.log(`  time: total=${phases.total} | dns=${phases.dns} | tcp=${phases.tcp} | ssl: ${phases.ssl || 'n/a'} | ttfb=${phases.firstByte} | download=${phases.download}`);
        }
      }
      console.log();
    });

    try {
      const context = await vu(initialContext);
    } catch (vuErr) {
      // console.log(vuErr);
    }
  }

  async run() {
    const { flags, argv, args } = this.parse(RunCommand);
    const flowFilePaths = [ path.resolve(process.cwd(), argv[0]) ];

    const banner = `    ───━━━★
SKYTRACE ──━━★
      ──━━★`;
    console.log(gradientString.vice(banner));
    console.log();

    if(flags.reload) {
      console.log('> Running flow (reload mode on)');
      console.log();
      this.runFlow(flowFilePaths[0]);
      let prevMtime = new Date(0);
      let rerunning = false;
      fs.watch(flowFilePaths[0], {}, (eventType, fn) => {
                if (!fn) {
                  return;
                }

                const stat = fs.statSync(fn);
                if (stat.mtime.valueOf() === prevMtime.valueOf()) {
                  return;
                }

                if(rerunning) {
                  return;
                }

                prevMtime = stat.mtime;
                rerunning = true;

                console.log();
                console.log('  --------------');
                console.log('> Rerunning flow');
                console.log(' ', new Date());
                console.log('  --------------');
                this.runFlow(flowFilePaths[0]);
                console.log();

                rerunning = false;
              });
    } else {
      console.log('> Running flow');
      // console.log('source:', flowFilePath);
      console.log('');
      await this.runFlow(flowFilePaths[0]);
    }
  }
}

RunCommand.description = `Run flows`;
RunCommand.flags = {
  reload: flags.boolean({
    char: 'r',
    description: 'reload and rerun flow automatically'
  })
};
RunCommand.args = [{
  name: 'file',
  required: true,
  description: 'Path to flow files'
}];

module.exports = { RunCommand };