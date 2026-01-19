const { EventEmitter } = require('node:events');
const { promisify: p, format } = require('node:util');
const fs = require('node:fs');

const _nodeCrypto = require('node:crypto');

const _os = require('node:os');

const sprintf = require('sprintf-js').sprintf;
const { Command, flags } = require('@oclif/command');
const debug = require('debug')('commands:ping');
const chalk = require('chalk');
const highlight = require('cli-highlight').highlight;
const temp = require('temp').track();
const mime = require('mime-types');
const jmespath = require('jmespath');
const cheerio = require('cheerio');
const YAML = require('js-yaml');

//const telemetry = require('../telemetry').init();
const HttpEngine = require('@artilleryio/int-core').engine_http;

import { expectations } from 'artillery-plugin-expect';

function fmt(val: any, padTo: number = 8) {
  return chalk.cyan(
    sprintf(`%-${padTo}s`, typeof val === 'number' ? `${val}ms` : val)
  );
}

function parse(str: string) {
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
  static aliases = ['probe', 'http'];
  // Enable multiple args:
  static strict = false;
  pipingJMESPathOutput = false;
  outputtingJSON = false;
  suggestedExitCode = 0;

  log(...args: any) {
    if (!this.pipingJMESPathOutput && !this.outputtingJSON) {
      console.log.apply(console, args);
    }
  }

  async run() {
    debug('ping:run');

    const { flags, argv, args } = this.parse(PingCommand);

    if (flags.pretty) {
      flags.showBody = true;
    }

    if (flags.jmespath) {
      this.pipingJMESPathOutput = true;
    }
    if (flags.outputJson) {
      this.outputtingJSON = true;
    }

    debug({ flags, args, argv });

    if (!args.target && !args.method) {
      this._help();
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

    interface RequestSpec {
      get?: any;
      post?: any;
      head?: any;
      put?: any;
      patch?: any;
      delete?: any;
      options?: any;
    }

    const placeholder: RequestSpec = {};

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
            context.vars.ip = res.ip;
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
          flow: [placeholder]
        }
      ]
    };

    //
    // Construct request spec:
    //
    script.scenarios[0].flow[0] = {};

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
        auth = parse(flags.auth);
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
        jsonBody = parse(flags.json);
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
          const header = parse(h);
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
          const querystring = parse(q);
          qs = Object.assign({}, qs, querystring);
        } catch (parseErr: any) {
          console.error(
            chalk.red(
              'Could not parse value of --qs as valid JSON, YAML or key-value string'
            )
          );
          console.error(chalk.red(qs));
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
        form = parse(flags.form);
      } catch (parseErr: any) {
        console.error(
          chalk.red(
            'Could not parse value of --form as valid JSON, YAML or key-value string'
          )
        );
        console.error(chalk.red(form));
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
          const expectation = parse(ex);
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
    const events = new EventEmitter();

    const vu = p(engine.createScenario(script.scenarios[0], events));
    const initialContext = {
      vars: {}
    };
    events.on('error', (_errCode) => {});

    try {
      debug('ping:vu:start');
      const context = await vu(initialContext);
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

      this.log(
        `Connected to ${new URL(target).origin} (${chalk.cyan(
          context.vars.ip
        )})\n`
      );

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
        const suffix = mime.extension(contentType);
        const fn = temp.path({ suffix: `.${suffix}` });
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
      // If -bp is set - pretty-print JSON or XML/HTML, otherwise print the body as-is.
      if (flags.showBody) {
        if (!flags.pretty) {
          this.log(context.vars.body);
        } else {
          if (isJSON) {
            if (!isBodyValidJSON) {
              this.log(
                chalk.red(
                  'Could not parse body is valid JSON for pretty-printing'
                )
              );
            } else {
              this.log(
                highlight(JSON.stringify(body, null, 4), { language: 'json' })
              );
            }
          } else if (isXML) {
            this.log(highlight(context.vars.body, { language: 'html' }));
          } else {
            this.log(context.vars.body);
          }
        }
      }

      if (flags.jmespath || flags.cheerio || flags.q) {
        if (flags.jmespath || (isJSON && flags.q)) {
          try {
            const result = jmespath.search(body, flags.jmespath || flags.query);

            // If our output is piped we want to print the JSON without highlighting:
            if (process.stdout.isTTY) {
              console.log(
                highlight(JSON.stringify(result, null, 4), { language: 'json' })
              );
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
            // If our output is piped we want to print the without highlighting:
            if (process.stdout.isTTY) {
              console.log(highlight(elts, { language: 'html' }));
            } else {
              console.log(elts);
            }
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

      // await sleep(300);

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

// TODO: Move this to entrypoint of the CLI
PingCommand.description = `Swiss Army Knife For Testing HTTP

Test HTTP URLs, visualize request performance, send arbitrary HTTP requests, and
run expectations and checks.

Examples:

    Check response headers and visualize request performance:

        $ skytrace ping http://lab.artillery.io

    Use Basic HTTP Authentication with a username and password:

        $ skytrace http --auth "{user: tiki, pass: pony1}" http://lab.artillery.io

Docs:

  More examples: https://docs.art/examples/http-cli
  Testing HTTP with Artillery: https://docs.art/http-reference

Supported HTTP methods: GET, POST, HEAD, PATCH, DELETE, PUT, OPTIONS
If the protocol is not specified, Skytrace will default to "https://"
`;

// TODO: Link to an Examples section in the docs

PingCommand.flags = {
  insecure: flags.boolean({
    char: 'k',
    description: 'Allow insecure TLS connections; do not use in production'
  }),
  showBody: flags.boolean({
    char: 'b',
    description: 'Show response body'
  }),
  pretty: flags.boolean({
    char: 'p',
    description: 'Pretty-print JSON responses'
  }),
  verbose: flags.boolean({
    char: 'v',
    description: 'Print request headers'
  }),
  jmespath: flags.string({
    description:
      'Run a JMESPath query on a JSON response body (https://docs.art/jmespath)'
  }),
  cheerio: flags.string({
    description:
      'Run a Cheerio query on a HTML/XML response body (https://cheerio.js.org)'
  }),
  query: flags.string({
    char: 'q',
    description:
      'Run a JMESPath or Cheerio query on response body depending on content type. This is a shortcut for --jmespath or --cheerio'
  }),
  h1: flags.boolean({
    description:
      'Force HTTP/1.1 (HTTP/2 is used by default when supported by the server)'
  }),
  // outputJson: flags.boolean({
  //   char: 'j',
  //   description: 'Format all output as JSON'
  // }),
  expect: flags.string({
    char: 'e',
    multiple: true,
    description: 'Set expectation checks on response'
  }),

  // HTTP options:
  auth: flags.string({
    description: 'Set HTTP Basic Authentication credentials'
  }),
  json: flags.string({
    description: 'Set JSON body for request'
  }),
  qs: flags.string({
    description: 'Set querystring',
    multiple: true
  }),
  headers: flags.string({
    char: 'H',
    description: 'Set request headers',
    multiple: true
  }),
  body: flags.string({
    description: 'Set request body'
  }),
  form: flags.string({
    description: 'Send an URL-encoded form (application/x-www-form-urlencoded)'
  })
};

PingCommand.args = [
  {
    name: 'method',
    required: false
  },
  {
    name: 'target',
    required: false
  }
];

module.exports = PingCommand;
