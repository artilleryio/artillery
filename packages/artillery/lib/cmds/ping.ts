/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { format } from 'node:util';

import { engine_http as HttpEngine } from '@artilleryio/int-core';
import { Args, Command, Flags } from '@oclif/core';
import { expectations } from 'artillery-plugin-expect';
import chalkModule from 'chalk';
import * as cheerio from 'cheerio';
import createDebug from 'debug';
import jmespath from 'jmespath';
import YAML from 'js-yaml';
import { temporaryFile } from 'tempy';

const chalk: any = chalkModule;
const debug = createDebug('commands:ping');

function fmt(val: any, padTo = 8) {
  const s = typeof val === 'number' ? `${val}ms` : `${val}`;
  return chalk.cyan(s.padEnd(padTo));
}

function parseSpec(str: string) {
  const format1 = /^[A-Za-z0-9\-_]+=[A-Za-z0-9\-_]+$/i;
  const format2 = /^[A-Za-z0-9\-_]+:[A-Za-z0-9\-_]+$/i;

  if (format1.test(str)) {
    const components: string[] = str.split('=');
    const result = {};
    result[components[0]] = components[1];
    debug('parse: format1:', str, result);
    return result;
  }

  if (format2.test(str)) {
    const components: string[] = str.split(':');
    const result = {};
    result[components[0]] = components[1];
    debug('parse: format2:', str, result);
    return result;
  }

  const result: any = YAML.safeLoad(str);
  debug('parse: YAML:', str, result);

  if (typeof result !== 'object') {
    throw new Error('Expected object');
  }

  return result;
}

function extensionForContentType(contentType: string) {
  const essence = contentType.split(';')[0].trim().toLowerCase();
  if (essence.includes('json')) {
    return 'json';
  }
  if (essence.includes('html')) {
    return 'html';
  }
  if (essence.includes('xml')) {
    return 'xml';
  }
  if (essence.startsWith('text/')) {
    return 'txt';
  }
  return 'bin';
}

const VERBS = [
  'get',
  'head',
  'post',
  'put',
  'delete',
  'options',
  'patch',
  'connect',
  'trace'
];

class PingCommand extends Command {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  // Enable multiple args:
  static strict = false;

  log(...args: any) {
    if (!this.pipingJMESPathOutput) {
      console.log.apply(console, args);
    }
  }

  async run() {
    debug('ping:run');

    this.pipingJMESPathOutput = false;
    this.suggestedExitCode = 0;

    const parsed = await this.parse(PingCommand);
    // Cast: oclif's types reserve `flags.json` for its built-in JSON-output
    // flag; this command defines its own --json string flag
    const flags: any = parsed.flags;
    const args: any = parsed.args;

    if (flags.pretty) {
      flags.showBody = true;
    }

    if (flags.jmespath) {
      this.pipingJMESPathOutput = true;
    }

    debug({ flags, args });

    if (!args.target && !args.method) {
      await this.config.runCommand('help', ['ping']);
      return;
    }

    let verb: string;
    let target: string;
    if (VERBS.indexOf(args.method.toLowerCase()) === -1) {
      verb = 'get';
      target = args.method;
    } else {
      verb = args.method;
      target = args.target;
    }

    // Default to HTTPS if no protocol on the URL
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }

    const script = {
      config: {
        target: target,
        http: {
          extendedMetrics: true
        },
        tls: {},
        processor: {
          captureRequestDetails: (req, res, context, _events, next) => {
            context.vars.requestHeaders = res.req._header;
            context.vars.ip =
              res.ip || res.socket?.remoteAddress || res.client?.remoteAddress;
            context.vars.statusCode = res.statusCode;
            context.vars.httpVersion = res.httpVersion;
            context.vars.statusMessage = res.statusMessage;
            context.vars.headers = res.headers;
            context.vars.body = res.body;
            context.vars.status = res.statusCode;
            context.vars.timings = res.timings;

            context.vars.req = req;
            context.vars.res = res;
            next();
          }
        }
      },
      scenarios: [
        {
          flow: [{}]
        }
      ]
    };

    //
    // Construct request spec:
    //

    interface RequestParams {
      url: string;
      afterResponse: string;
      username?: string;
      password?: string;
      json?: any;
      headers?: any;
      qs?: any;
      form?: any;
      body?: any;
      http2?: boolean;
    }

    const requestSpec: RequestParams = {
      url: target,
      afterResponse: 'captureRequestDetails'
    };

    // Basic auth:
    if (flags.auth) {
      let auth: any;
      try {
        auth = parseSpec(flags.auth);
      } catch (parseErr: any) {
        console.error(
          chalk.red('Could not parse value of --auth as valid JSON or YAML')
        );
        console.error(chalk.red(parseErr.message));
        console.error('Example: --auth {user: tiki, pass: pony1}');
        process.exit(1);
      }
      requestSpec.username = auth.user;
      requestSpec.password = auth.pass;
    }

    // JSON body:
    if (flags.json) {
      let jsonBody: any;
      try {
        jsonBody = parseSpec(flags.json);
      } catch (parseErr: any) {
        console.error(
          chalk.red('Could not parse value of --json as valid JSON or YAML')
        );
        console.error(chalk.red(parseErr.message));
        console.error('Example: --json "{name: Tiki, species: pony}"');
        process.exit(1);
      }
      debug(jsonBody);
      requestSpec.json = jsonBody;
    }

    // Headers:
    if (flags.headers?.length > 0) {
      let headers = {};
      for (const h of flags.headers) {
        try {
          const header = parseSpec(h);
          headers = Object.assign({}, headers, header);
        } catch (parseErr: any) {
          console.error(
            chalk.red(
              'Could not parse value of --header as valid JSON or YAML or key-value string'
            )
          );
          console.error(chalk.red(h));
          console.error(chalk.red(parseErr.message));
          console.error('Example: --header "x-my-header: my-value"');
          process.exit(1);
        }
      }
      requestSpec.headers = headers;
    }

    // Querystrings:
    if (flags.qs?.length > 0) {
      let qs = {};
      for (const q of flags.qs) {
        try {
          const querystring = parseSpec(q);
          qs = Object.assign({}, qs, querystring);
        } catch (parseErr: any) {
          console.error(
            chalk.red(
              'Could not parse value of --qs as valid JSON, YAML or key-value string'
            )
          );
          console.error(chalk.red(q));
          console.error(chalk.red(parseErr.message));
          console.error('Example: --qs "keyword=pony"');
          process.exit(1);
        }
      }
      requestSpec.qs = qs;
    }

    // URL-encoded forms
    if (flags.form) {
      let form: any;
      try {
        form = parseSpec(flags.form);
      } catch (parseErr: any) {
        console.error(
          chalk.red(
            'Could not parse value of --form as valid JSON, YAML or key-value string'
          )
        );
        console.error(chalk.red(flags.form));
        console.error(chalk.red(parseErr.message));
        console.error(
          'Example: send a form containing two fields:\n  --form "{name: tiki, type: pony}"'
        );
        process.exit(1);
      }
      requestSpec.form = form;
    }

    // Body:
    if (flags.body) {
      requestSpec.body = flags.body;
    }

    if (!flags.h1) {
      requestSpec.http2 = true;
    }

    // Set spec
    script.scenarios[0].flow[0][verb] = requestSpec;

    if (flags.insecure) {
      script.config.tls = {
        rejectUnauthorized: !flags.insecure
      };
    }

    // Expectations:
    const checks = [];
    if (flags.expect?.length > 0) {
      for (const ex of flags.expect) {
        try {
          const expectation = parseSpec(ex);
          checks.push(expectation);
        } catch (parseErr) {
          console.error(
            chalk.red(
              'Could not parse value of --expect as valid JSON or YAML or key-value string'
            )
          );
          console.error(chalk.red(ex));
          console.error(chalk.red(parseErr.message));
          console.error('Example: --expect "{statusCode: 200}"');
          process.exit(1);
        }
      }
    }

    debug(JSON.stringify(script, null, 4));
    const engine = new HttpEngine(script);
    // Loads the HTTP client (got) - see HttpEngine.prototype.init
    await engine.init();
    const events = new EventEmitter();

    const vu = engine.createScenario(script.scenarios[0], events);
    const initialContext = {
      vars: {}
    };
    events.on('error', (_errCode) => {});

    try {
      debug('ping:vu:start');
      const context: any = await vu(initialContext);
      debug('ping:vu:end');

      const TEMPLATE =
        '' +
        'DNS Lookup | TCP Connection | SSL Handshake | Time to First Byte | Content Transfer  ' +
        '\n' +
        '  %s|  %s|     %s|     %s|   %s |\n' +
        '            |                |               |                    |                 |' +
        '\n' +
        '            %s         |               |                    |                 |' +
        '\n' +
        '                          %s           |                    |                 |' +
        '\n' +
        '                                           %s               |                 |' +
        '\n' +
        '                                                                %s            |' +
        '\n' +
        '                                                                               total:%s' +
        '\n';

      const timings = context.vars.timings;
      const phases = timings.phases;

      // The remote address is not always available, e.g. on HTTP/2
      // connections where the session socket is gone by the time the
      // afterResponse hook runs
      const ipInfo = context.vars.ip ? ` (${chalk.cyan(context.vars.ip)})` : '';
      this.log(`Connected to ${new URL(target).origin}${ipInfo}\n`);

      if (flags.verbose) {
        this.log(chalk.cyan('Request:\n'));
        this.log(context.vars.requestHeaders);
      }

      if (flags.verbose) {
        this.log(chalk.cyan('Response:\n'));
      }
      this.log(
        `HTTP/${context.vars.httpVersion} ${
          context.vars.statusCode < 400
            ? chalk.green(context.vars.statusCode, context.vars.statusMessage)
            : chalk.red(context.vars.statusCode, context.vars.statusMessage)
        }`
      );

      for (const headerName of Object.keys(context.vars.headers)) {
        this.log(
          `${headerName}: ${chalk.blue(context.vars.headers[headerName])}`
        );
      }

      // HTTP/2 timings API has an issue in Got, so we zero out the values when not available
      // https://github.com/sindresorhus/got/issues/1958
      this.log(
        '\n\n',
        format(
          TEMPLATE,
          // Phase durations:
          fmt(phases.dns || 0, 10),
          fmt(phases.tcp || 0, 14),
          fmt(phases.tls || 'N/A', 10),
          fmt(phases.firstByte, 15),
          fmt(phases.download, 13),
          // Cumulative:
          fmt(phases.dns || 0),
          fmt(timings.connect - timings.socket || 0),
          fmt((timings.secureConnect || timings.connect) - timings.socket || 0),
          fmt(timings.response - timings.socket),
          fmt(timings.end - timings.socket)
        ).replace(/\|/g, chalk.gray('|'))
      );

      if (parseInt(context.vars.res.httpVersion, 10) > 1) {
        this.log(
          chalk.gray(
            '(NOTE: DNS, TCP and SSL overhead is not reported for HTTP/2 yet)'
          )
        );
      }

      const contentType =
        context.vars.headers?.['content-type'] || 'application/octet-stream';
      if (context.vars.body) {
        const fn = temporaryFile({
          extension: extensionForContentType(contentType)
        });
        fs.writeFileSync(fn, context.vars.body);
        this.log(`\n${chalk.cyan('Body')} stored in: ${fn}\n`);
      }

      const isJSON = contentType.match(/json/gi);
      const isXML = contentType.match(/html/gi) || contentType.match(/xml/gi);

      let body = context.vars.body;
      let isBodyValidJSON = false;
      if (isJSON) {
        // Try to parse the body as JSON. Errors are ignored because as a
        // general purpose HTTP client we don't want to fail on invalid
        // JSON by default - only if the user explicitly or implicitly
        // specifies that the body needs to be valid.
        try {
          body = JSON.parse(context.vars.body);
          isBodyValidJSON = true;
        } catch (_parseErr) {}
      }

      // If -b is set without -p -- just print the body as-is.
      // If -bp is set - pretty-print JSON, otherwise print the body as-is.
      if (flags.showBody) {
        if (!flags.pretty) {
          this.log(context.vars.body);
        } else {
          if (isJSON) {
            if (!isBodyValidJSON) {
              this.log(
                chalk.red(
                  'Could not parse body as valid JSON for pretty-printing'
                )
              );
            } else {
              this.log(JSON.stringify(body, null, 4));
            }
          } else {
            this.log(context.vars.body);
          }
        }
      }

      if (flags.jmespath || flags.cheerio || flags.query) {
        if (flags.jmespath || (isJSON && flags.query)) {
          try {
            const result = jmespath.search(body, flags.jmespath || flags.query);

            // If our output is piped we want to print compact JSON:
            if (process.stdout.isTTY) {
              console.log(JSON.stringify(result, null, 4));
            } else {
              console.log(JSON.stringify(result));
            }
          } catch (err: any) {
            console.error(chalk.red(err.message));
            process.exit(1);
          }
        } else if (flags.cheerio || (isXML && flags.query)) {
          try {
            const $ = cheerio.load(body);
            const elts = $(flags.cheerio || flags.query).html();
            console.log(elts);
          } catch (err: any) {
            console.error(chalk.red(err.message));
            process.exit(1);
          }
        } else {
          console.error(
            chalk.yellow('Content-Type is not JSON or XML/HTML:'),
            contentType
          );
          console.error(chalk.yellow('Unable to run a query'));
        }
      }

      if (checks.length > 0) {
        this.log(chalk.cyan('Expectations:\n'));
        const results = [];

        for (const ex of checks) {
          const checker = Object.keys(ex)[0];
          const result = expectations[checker].call(
            this,
            ex,
            body,
            context.vars.req,
            context.vars.res,
            {}
          );
          results.push(result);
        }

        const failedExpectations = results.filter((res) => !res.ok).length > 0;

        if (failedExpectations) {
          this.suggestedExitCode = 1;
        }

        results.forEach((result) => {
          this.log(
            `*  ${result.ok ? chalk.green('ok') : chalk.red('not ok')} ${
              result.type
            } ${result.got} `
          );

          if (!result.ok) {
            this.log(`   expected: ${result.expected}`);
            this.log(`        got: ${result.got}`);
          }
        });
      }

      process.exit(this.suggestedExitCode);
    } catch (vuErr: any) {
      if (vuErr.code === 'ENOTFOUND') {
        this.log(chalk.red(`${vuErr.code} - DNS lookup failed on ${target}`));
      } else {
        console.error(vuErr);
      }
      process.exit(1);
    }
  }
}

PingCommand.aliases = ['probe'];

PingCommand.description = `Swiss army knife for testing HTTP

Test HTTP URLs, visualize request performance, send arbitrary HTTP requests, and
run expectations and checks on responses.

Examples:

    Check response headers and visualize request performance:

        $ artillery ping https://www.artillery.io

    Use Basic HTTP Authentication with a username and password:

        $ artillery ping --auth "{user: tiki, pass: pony1}" http://lab.artillery.io

Supported HTTP methods: GET, POST, HEAD, PATCH, DELETE, PUT, OPTIONS
If the protocol is not specified, "https://" is used by default
`;

PingCommand.flags = {
  insecure: Flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections; do not use in production'
  }),
  showBody: Flags.boolean({
    char: 'b',
    description: 'Show response body'
  }),
  pretty: Flags.boolean({
    char: 'p',
    description: 'Pretty-print JSON responses'
  }),
  verbose: Flags.boolean({
    char: 'v',
    description: 'Print request headers'
  }),
  jmespath: Flags.string({
    description: 'Run a JMESPath query on a JSON response body'
  }),
  cheerio: Flags.string({
    description:
      'Run a Cheerio query on a HTML/XML response body (https://cheerio.js.org)'
  }),
  query: Flags.string({
    char: 'q',
    description:
      'Run a JMESPath or Cheerio query on response body depending on content type. This is a shortcut for --jmespath or --cheerio'
  }),
  h1: Flags.boolean({
    description:
      'Force HTTP/1.1 (HTTP/2 is used by default when supported by the server)'
  }),
  expect: Flags.string({
    char: 'e',
    multiple: true,
    multipleNonGreedy: true,
    description: 'Set expectation checks on response'
  }),

  // HTTP options:
  auth: Flags.string({
    description: 'Set HTTP Basic Authentication credentials'
  }),
  json: Flags.string({
    description: 'Set JSON body for request'
  }),
  qs: Flags.string({
    description: 'Set querystring',
    multiple: true,
    multipleNonGreedy: true
  }),
  headers: Flags.string({
    char: 'H',
    description: 'Set request headers',
    multiple: true,
    multipleNonGreedy: true
  }),
  body: Flags.string({
    description: 'Set request body'
  }),
  form: Flags.string({
    description: 'Send an URL-encoded form (application/x-www-form-urlencoded)'
  })
};

PingCommand.args = {
  method: Args.string({ required: false }),
  target: Args.string({ required: false })
};

export default PingCommand;
