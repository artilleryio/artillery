// Public type surface for the `artillery` package - and the canonical
// compile-time model of an Artillery test script.
//
// Canonical means: when this model, the editor JSON schema
// (packages/types/schema, Joi -> schema.json) or the runtime validator
// (lib/util/validate-script.ts) disagree, this file is the reference
// that the others are corrected against. Internal modules consume
// these types with type-only imports (`import type { ... } from
// '../types.js'`), which are erased at runtime.
//
// Known intentional differences between the three models:
// - The editor schema allows unknown properties everywhere (forward
//   compatibility in editors); this model uses `unknown`-valued index
//   signatures only where extensions are expected.
// - The runtime validator requires `scenarios` and (without
//   `environments`) `config.target`; this input model keeps both
//   optional because config fragments and environment-provided
//   targets are supported at merge time.
//
// This file describes the built package entry (dist/lib/index.js):
// keep runtime declarations (getStash) in sync with lib/index.ts.

import { Redis } from '@upstash/redis';
import { type Page } from 'playwright';

/**
 * Artillery Stash client
 *
 * Represents the Artillery Cloud Stash API client which is Redis-compatible.
 * Will be null if stash is not available (e.g., no API key, not on Business/Enterprise plan).
 *
 * @example
 * ```typescript
 * import { Stash } from 'artillery';
 *
 * const stash: Stash = global.artillery.stash;
 * if (stash) {
 *   await stash.set('key', 'value');
 *   const value = await stash.get('key');
 * }
 * ```
 */
export type Stash = Redis | null;

declare global {
  // Merges with the monorepo-internal declaration in globals.d.ts;
  // standalone consumers get this minimal surface.
  interface ArtilleryGlobal {
    /**
     * Artillery Cloud Stash API client (Redis-compatible)
     * Available when Artillery is run with --key flag, on Business and Enterprise plans
     * Set to null otherwise.
     */
    stash: Stash;
  }

  // eslint-disable-next-line no-var
  var artillery: ArtilleryGlobal;
}

/**
 * Options for configuring the Artillery stash client
 */
export interface GetStashOptions {
  /**
   * Artillery Cloud API key. If not provided, will use ARTILLERY_CLOUD_API_KEY environment variable
   */
  apiKey?: string;
}

/**
 * Get an Artillery Stash client instance
 *
 * This function connects to Artillery Cloud  and returns a configured Stash client instance
 *
 * @param options - Configuration options
 * @returns Promise that resolves to Stash client instance or null if not available
 *
 * @example
 * ```typescript
 * import { getStash } from 'artillery';
 *
 * const stash = await getStash();
 * if (stash) {
 *   await stash.set('key', 'value');
 *   const value = await stash.get('key');
 * }
 * ```
 */
export function getStash(options?: GetStashOptions): Promise<Stash>;

//
// Test script input model
// =======================
//

/**
 * A complete Artillery test script (the shape of a test YAML/JSON file).
 * https://www.artillery.io/docs/reference/test-script
 */
export type TestScript = {
  /**
   * Test configuration: target, load phases, engines, plugins, payload.
   */
  config?: Config;
  /**
   * Optional scenario to run once per test definition before the main
   * `scenarios` section.
   */
  before?: BeforeAfterSpec;
  /**
   * Optional scenario to run once per test definition after the main
   * `scenarios` section.
   */
  after?: BeforeAfterSpec;
  /**
   * Definition of scenarios for virtual users to run.
   */
  scenarios?: Scenarios;
};

/**
 * `before`/`after` sections: a single scenario-like flow executed once
 * per test definition.
 * https://www.artillery.io/docs/reference/test-script#before-and-after-sections
 */
export type BeforeAfterSpec = {
  engine?: string;
  flow: FlowStep[];
};

export type Config = {
  /**
   * Endpoint of the system under test, such as a hostname, IP address or a URI.
   * May be omitted when provided by an environment (`config.environments`)
   * or resolved from a template variable at runtime.
   * https://www.artillery.io/docs/reference/test-script#target---target-service
   */
  target?: string;
  /**
   * A load phase defines how Artillery generates new virtual users (VUs)
   * in a specified time period.
   * https://www.artillery.io/docs/reference/test-script#phases---load-phases
   */
  phases?: TestPhase[];
  /**
   * Named configuration profiles; selected with `--environment`.
   * https://www.artillery.io/docs/reference/test-script#environments---config-profiles
   */
  environments?: Record<string, EnvironmentConfig>;
  /**
   * Map of variables to expose to the test run.
   * https://www.artillery.io/docs/reference/test-script#variables---inline-variables
   */
  variables?: Record<string, unknown>;
  /**
   * Load and configure engines.
   */
  engines?: EngineConfigs;
  /**
   * Load and configure plugins (official or third-party).
   */
  plugins?: PluginsConfig;
  /**
   * Path to a CommonJS (.js), ESM (.mjs) or TypeScript (.ts) module to
   * load for this test run.
   * https://www.artillery.io/docs/reference/test-script#processor---custom-js-code
   */
  processor?: string;
  /**
   * Load data from CSV files.
   * https://www.artillery.io/docs/reference/test-script#payload---loading-data-from-csv-files
   */
  payload?: PayloadConfig | PayloadConfig[];
  /**
   * TLS settings.
   */
  tls?: {
    /**
     * Set this setting to `false` to tell Artillery to accept
     * self-signed TLS certificates.
     * @default true
     */
    rejectUnauthorized?: boolean;
  };
  /**
   * HTTP engine configuration.
   * https://www.artillery.io/docs/reference/engines/http
   */
  http?: HttpConfig;
  /**
   * WebSocket engine configuration.
   * https://www.artillery.io/docs/reference/engines/websocket
   */
  ws?: WebSocketConfig;
  /**
   * Socket.IO engine configuration.
   * https://www.artillery.io/docs/reference/engines/socketio
   */
  socketio?: SocketIoConfig;
  /**
   * `ensure` checks (may also be set via `config.plugins.ensure`).
   * https://www.artillery.io/docs/reference/extensions/ensure
   */
  ensure?: EnsurePluginConfig;
  /**
   * `apdex` configuration (may also be set via `config.plugins.apdex`).
   */
  apdex?: ApdexPluginConfig;
  /**
   * Bundling configuration for TypeScript processors.
   * https://www.artillery.io/docs/reference/test-script#preventing-bundling-of-typescript-packages
   */
  bundling?: {
    /** npm modules to exclude from the processor bundle. */
    external?: string[];
  };
  /**
   * Extra files to include when running distributed tests on AWS
   * Lambda/Fargate.
   * https://www.artillery.io/docs/reference/test-script#includefiles---explicitly-bundling-files-with-the-test
   */
  includeFiles?: string[];
  /**
   * Default engine for scenarios that do not set one.
   * @default "http"
   */
  engine?: string;
  /**
   * Default arrival distribution mode for phases.
   */
  mode?: 'uniform' | 'poisson';
  /**
   * Interval (in seconds) between metric reports.
   * @default 30
   */
  statsInterval?: number;
  /**
   * Top-level request timeout in seconds (prefer `http.timeout`).
   */
  timeout?: number;
  /**
   * Legacy default request settings (prefer `http.defaults`).
   * @deprecated
   */
  defaults?: HttpDefaults;
  /**
   * Escape hatch: additional configuration for third-party engines and
   * plugins. Prefer typed properties above.
   */
  [key: string]: unknown;
};

/**
 * An environment profile: any config settings except nested
 * `environments`.
 */
export type EnvironmentConfig = Omit<Config, 'environments'>;

/**
 * A load phase. Exactly one of the three phase kinds:
 * - arrival rate (optionally ramping)
 * - fixed arrival count
 * - pause
 * https://www.artillery.io/docs/reference/test-script#phases---load-phases
 */
export type TestPhase = ArrivalRatePhase | ArrivalCountPhase | PausePhase;

type PhaseCommon = {
  /** Test phase name. */
  name?: string;
};

/**
 * Constant or ramping arrival rate over a time period.
 * At least one of `arrivalRate` and `rampTo` must be set.
 */
export type ArrivalRatePhase = PhaseCommon &
  (
    | {
        /**
         * Test phase duration (in seconds), or any valid
         * [human-readable duration](https://www.npmjs.com/package/ms).
         */
        duration: number | string;
        /** Number of virtual users generated every second. */
        arrivalRate: number | string;
        /** Ramp from `arrivalRate` to this value over the duration. */
        rampTo?: number | string;
        /** Cap on concurrently active virtual users. */
        maxVusers?: number | string;
        /** Arrival distribution mode. @default "uniform" */
        mode?: 'uniform' | 'poisson';
      }
    | {
        duration: number | string;
        arrivalRate?: number | string;
        /** Ramp up to this arrival rate over the duration. */
        rampTo: number | string;
        maxVusers?: number | string;
        mode?: 'uniform' | 'poisson';
      }
  );

/** Fixed number of virtual users over a time period. */
export type ArrivalCountPhase = PhaseCommon & {
  duration: number | string;
  /** Total number of virtual users created over the phase duration. */
  arrivalCount: number | string;
  maxVusers?: number | string;
};

/** Pause test execution for the given duration (in seconds). */
export type PausePhase = PhaseCommon & {
  pause: number | string;
};

/**
 * CSV payload definition.
 * https://www.artillery.io/docs/reference/test-script#payload---loading-data-from-csv-files
 */
export type PayloadConfig = {
  /** Path to the CSV file. */
  path: string;
  /** Names of fields to map CSV columns onto. */
  fields: string[];
  /**
   * Controls how the CSV rows are selected for each virtual user.
   * (Previous versions of this type declared this field as `random` -
   * the runtime has only ever read `order`.)
   * @default "random"
   */
  order?: 'random' | 'sequence';
  /**
   * Set to `true` to make Artillery skip the first row in the CSV file
   * (typically the header row).
   * @default false
   */
  skipHeader?: boolean;
  /**
   * Custom delimiter character to use in the payload.
   * @default ","
   */
  delimiter?: string;
  /**
   * Controls whether Artillery converts fields to native types
   * (e.g. numbers or booleans). To keep those fields as strings,
   * set this option to `false`.
   * @default true
   */
  cast?: boolean;
  /**
   * Controls whether Artillery should skip empty lines in the payload.
   * @default true
   */
  skipEmptyLines?: boolean;
} & (
  | { loadAll?: never; name?: never }
  | {
      /** Provide all rows to every VU (via the variable named `name`). */
      loadAll: true;
      name: string;
    }
);

//
// Scenarios and flows
//

export type Scenarios = Scenario[];

type ScenarioCommon = {
  /** Scenario name. */
  name?: string;
  /**
   * The probability of how often this scenario will be picked up,
   * relative to other scenarios' weights.
   * @default 1
   */
  weight?: number | string;
  /** Functions to run before each scenario. */
  beforeScenario?: string | string[];
  /** Functions to run after each scenario. */
  afterScenario?: string | string[];
  /** Functions to run when a scenario errors. */
  onError?: string | string[];
};

export type Scenario = ScenarioCommon &
  (
    | {
        /** HTTP engine (the default). */
        engine?: 'http';
        flow: HttpFlowStep[];
      }
    | {
        /** WebSocket engine. */
        engine: 'websocket' | 'ws';
        flow: WsFlowStep[];
      }
    | {
        /** Socket.IO engine. */
        engine: 'socketio';
        flow: SocketIoFlowStep[];
      }
    | {
        /** Playwright engine. */
        engine: 'playwright';
        /** Name (or import) of the test function to run. */
        testFunction?: PlaywrightEngineScenarioTestFunction;
        /**
         * Name (or import) of the test function to run.
         * @deprecated Use testFunction instead
         */
        flowFunction?: PlaywrightEngineScenarioTestFunction;
      }
    | {
        /** A custom (third-party) engine. */
        engine: string;
        [key: string]: unknown;
      }
  );

/** Flow steps common to every network engine. */
export type BaseFlowStep =
  | {
      /** Print given message to the console. */
      log: string;
    }
  | {
      /**
       * Pause the virtual user for the given duration (in seconds), or
       * any valid [human-readable duration](https://www.npmjs.com/package/ms).
       */
      think: number | string;
    }
  | {
      /** Name of a processor function to run. */
      function: string;
    };

/** Loop options shared by all engines. */
export type LoopOptions = {
  /** Number of iterations, or a range like "1-5". Loops forever when omitted. */
  count?: number | string;
  /** Array (or name of a variable holding an array) to iterate over. */
  over?: string | unknown[];
  /** Name of a processor function controlling whether to continue. */
  whileTrue?: string;
};

export type HttpFlowStep =
  | BaseFlowStep
  | ({ loop: HttpFlowStep[] } & LoopOptions)
  | { get: HttpRequestSpec }
  | { post: HttpRequestWithBodySpec }
  | { put: HttpRequestWithBodySpec }
  | { patch: HttpRequestWithBodySpec }
  | { delete: HttpRequestWithBodySpec };

export type WsFlowStep =
  | BaseFlowStep
  | ({ loop: WsFlowStep[] } & LoopOptions)
  | {
      /** Data to send over the WebSocket connection. */
      send: string | Record<string, unknown>;
    }
  | {
      /** Override how the WebSocket connection is established. */
      connect:
        | string
        | { function: string }
        | {
            target?: string;
            proxy?: { url: string };
            headers?: Record<string, string>;
            subprotocols?: string[];
            /** Additional options for the underlying ws client. */
            [key: string]: unknown;
          };
    }
  | {
      /** Wait for a message and (optionally) capture/match on it. */
      wait: Record<string, unknown>;
    };

/** Data value accepted by Socket.IO emit/response/acknowledge specs. */
export type SocketIoData = string | Record<string, unknown> | string[];

export type SocketIoFlowStep =
  | HttpFlowStep
  | ({ loop: SocketIoFlowStep[] } & LoopOptions)
  | {
      /**
       * Emit an event: either `{ channel, data }` or an array of
       * emit arguments.
       * https://www.artillery.io/docs/reference/engines/socketio
       */
      emit: { channel?: string; data?: SocketIoData } | SocketIoData[];
      /** Optional namespace to use for emitting the event. */
      namespace?: string;
      /** Assert on (and optionally capture from) a response event. */
      response?: {
        /** The name of the event to listen to. */
        on?: string;
        /** The name of the channel where the response is received. */
        channel?: string;
        /** The data expected in the response. */
        data?: SocketIoData;
        /** Assert that the response emits these arguments. */
        args?: SocketIoData;
        match?: HttpMatch | HttpMatch[];
        capture?: JsonCapture;
      };
      /** Assert on (and optionally capture from) the acknowledge callback. */
      acknowledge?: {
        data?: SocketIoData;
        args?: SocketIoData;
        match?: HttpMatch | HttpMatch[];
        capture?: JsonCapture;
      };
    };

//
// HTTP requests
//

export type HttpRequestSpec = {
  /** Request URL: absolute, or relative to `config.target`. */
  url: string;
  /**
   * Descriptive name for the URL. Used by plugins and features that
   * aggregate by endpoint when URLs are dynamic.
   */
  name?: string;
  headers?: Record<string, string>;
  /** Cookies to set for this request. */
  cookie?: Record<string, string>;
  /** Query string parameters. */
  qs?: Record<string, unknown>;
  /**
   * Artillery follows redirects by default.
   * Set to `false` to stop following redirects.
   */
  followRedirect?: boolean;
  /**
   * Control automatic response decompression.
   * https://www.artillery.io/docs/reference/engines/http#compressed-responses-gzip
   * @default true
   */
  gzip?: boolean;
  /** Basic HTTP authentication. */
  auth?: {
    user: string;
    pass: string;
  };
  /**
   * Capture and reuse parts of the response.
   * https://www.artillery.io/docs/reference/engines/http#extracting-and-re-using-parts-of-a-response-request-chaining
   */
  capture?: HttpCapture | HttpCapture[];
  /**
   * Response validation criteria.
   * @deprecated Use `capture` and the expect plugin instead.
   */
  match?: HttpMatch | HttpMatch[];
  /** Functions to run before this request is sent. */
  beforeRequest?: string | string[];
  /** Functions to run after the response is received. */
  afterResponse?: string | string[];
  /** Expression that controls whether to execute this request. */
  ifTrue?: string;
  /** Probability (0-100) that this request executes for a given VU. */
  probability?: number | string;
  /**
   * Expectations on the response (expect plugin).
   * https://www.artillery.io/docs/reference/extensions/expect#expectations
   */
  expect?: ExpectPluginExpectations | ExpectPluginExpectations[];
};

export type HttpRequestWithBodySpec = HttpRequestSpec & {
  /** JSON request body. */
  json?: unknown;
  /** Raw request body. */
  body?: unknown;
  /**
   * URL-encoded form (application/x-www-form-urlencoded).
   * https://www.artillery.io/docs/reference/engines/http#url-encoded-forms-applicationx-www-form-urlencoded
   */
  form?: Record<string, unknown>;
  /**
   * Multipart form (multipart/form-data), e.g. for file uploads.
   * https://www.artillery.io/docs/reference/engines/http#multipart-forms-multipartform-data
   */
  formData?: Record<string, unknown>;
  /** Set the Content-Length header for file-upload requests. */
  setContentLengthHeader?: boolean;
};

type CaptureCommon = {
  /** Name of the variable to store the captured value in. */
  as: string;
  /**
   * Captures are strict by default: a failed capture stops the
   * scenario. Set to `false` to continue on failure.
   */
  strict?: boolean;
};

export type JsonCapture = CaptureCommon & {
  /** JSONPath expression. */
  json: string;
};

export type HttpCapture =
  | JsonCapture
  | (CaptureCommon & {
      /** XPath expression (requires artillery-xml-capture). */
      xpath: string;
    })
  | (CaptureCommon & {
      /** Regular expression to run on the response body. */
      regexp: string;
      /** Named or numbered capturing group to extract. */
      group?: string | number;
      /** Regular expression flags. */
      flags?: string;
    })
  | (CaptureCommon & {
      /** Name of the response header to capture. */
      header: string;
    })
  | (CaptureCommon & {
      /** Cheerio (CSS) selector to run on an HTML response. */
      selector: string;
      /** Attribute to read off the selected element. */
      attr?: string;
      /** Element index: a number, "last", or "random". */
      index?: number | string | 'last' | 'random';
    });

export type HttpMatch = {
  /** JSONPath of the response part to compare. */
  json: string;
  /** The expected value. */
  value: string;
};

//
// Engine configuration
//

/**
 * Configuration for engines. Known engines are typed; third-party
 * engines configure themselves through their own keys.
 */
export type EngineConfigs = {
  playwright?: PlaywrightEngineConfig;
  [engine: string]: unknown;
};

export type HttpDefaults = {
  /** Default headers for all requests. */
  headers?: Record<string, string>;
  /** Default cookies for all requests. */
  cookie?: Record<string, string>;
  /**
   * Whether captures are strict by default.
   * https://www.artillery.io/docs/reference/engines/http#turn-off-strict-capture
   * @default true
   */
  strictCapture?: boolean | string;
  /** Think-time options. */
  think?: {
    /**
     * Jitter to simulate real-world variance in think-time pauses.
     * A number or a percentage.
     */
    jitter?: number | string;
  };
};

export type HttpConfig = {
  /**
   * Request timeout in seconds.
   * @default 10
   */
  timeout?: number | string;
  /**
   * Maximum number of TCP connections per virtual user.
   * https://www.artillery.io/docs/reference/engines/http#max-sockets-per-virtual-user
   */
  maxSockets?: number;
  /**
   * Reuse a shared connection pool of this size across all VUs
   * instead of creating agents per VU.
   */
  pool?: number | string;
  /** Enable tracking of additional HTTP metrics. */
  extendedMetrics?: boolean;
  /** Options for the VU cookie jar (tough-cookie). */
  cookieJarOptions?: Record<string, unknown>;
  /**
   * W3C Trace Context propagation for distributed tracing.
   * https://www.w3.org/TR/trace-context/
   */
  distributedTracing?:
    | boolean
    | {
        /** @default true */
        enabled?: boolean;
        /** Set the sampled flag in trace-flags. @default true */
        sampled?: boolean;
        /** Prefix for generated trace IDs (max 8 hex chars). @default "a9" */
        traceIdPrefix?: string;
      };
  /**
   * Default settings applied to every request.
   * https://www.artillery.io/docs/reference/engines/http#default-configuration
   */
  defaults?: HttpDefaults;
};

export type WebSocketConfig = {
  /** WebSocket sub-protocols. */
  subprotocols?: Array<'json' | 'soap' | 'wamp' | 'xmpp'>;
  headers?: Record<string, string>;
  proxy?: {
    url: string;
  };
  /** Response timeout in seconds. @default 10 */
  timeout?: number;
  /** Additional options for the underlying ws client. */
  [key: string]: unknown;
};

/**
 * Socket.IO client options.
 * https://socket.io/docs/v4/client-api/
 */
export type SocketIoConfig = {
  /** Query parameters, as a string or dictionary. */
  query?: string | Record<string, string>;
  path?: string;
  /**
   * Extra headers (only used with the default polling transport).
   */
  extraHeaders?: Record<string, string>;
  /** Skip long-polling by specifying WebSocket transport only. */
  transports?: Array<'websocket'>;
  /** Additional options for the underlying socket.io client. */
  [key: string]: unknown;
};

export type PlaywrightEngineScenarioTestFunction =
  | string
  | ((
      page: Page,
      userContext: VUContext,
      events: VUEvents,
      test: PlaywrightEngineTestParam
    ) => Promise<void>);

export type PlaywrightEngineTestParam = {
  step: (
    stepName: string,
    userActions: () => void | Promise<void>
  ) => Promise<void>;
};

export type PlaywrightEngineTraceConfig = {
  /**
   * Enable Playwright trace recording.
   * @default false
   */
  enabled?: boolean;
  /**
   * Max number of VUs recording a trace at the same time.
   * @default 5
   */
  maxConcurrentRecordings?: number;
  /**
   * Total limit on the number of traces recorded during a test run.
   * @default 360
   */
  maxTraceRecordings?: number;
  /**
   * Minimum interval (in seconds) between saved recordings.
   * Defaults to a randomized interval between 1 and 5 minutes.
   */
  recordingIntervalSec?: number;
};

export type PlaywrightEngineConfig = {
  /**
   * Arguments for the `browser.launch()` call in Playwright.
   * https://playwright.dev/docs/api/class-browsertype#browser-type-launch
   */
  launchOptions?: Record<string, unknown>;
  /**
   * Arguments for the `browser.newContext()` call in Playwright.
   * https://playwright.dev/docs/api/class-browser#browser-new-context
   */
  contextOptions?: Record<string, unknown>;
  /**
   * Default maximum time (in seconds) for all Playwright methods
   * accepting the `timeout` option.
   * https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout
   */
  defaultTimeout?: number;
  /**
   * Default maximum navigation time (in seconds)
   * for Playwright navigation methods, like `page.goto()`.
   * https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-navigation-timeout
   */
  defaultNavigationTimeout?: number;
  /**
   * When set, changes the attribute used by locator `page.getByTestId` in Playwright.
   * https://playwright.dev/docs/api/class-framelocator#frame-locator-get-by-test-id
   */
  testIdAttribute?: string;
  /**
   * Aggregate Artillery metrics by test scenario name.
   * https://www.artillery.io/docs/reference/engines/playwright#aggregate-metrics-by-scenario-name
   */
  aggregateByName?: boolean;
  /**
   * Enable Playwright trace recordings.
   * https://www.artillery.io/docs/reference/engines/playwright#tracing-configuration
   */
  trace?: boolean | PlaywrightEngineTraceConfig;
  /**
   * Report additional browser metrics.
   * https://www.artillery.io/docs/reference/engines/playwright#extended-metrics
   */
  extendedMetrics?: boolean;
  /**
   * Show metrics for all domains & pages. When enabled, metrics for iframes
   * and pages not hosted on the base URL will be reported.
   */
  showAllPageMetrics?: boolean;
  /**
   * Launch a separate browser for each new VU, rather than using a new
   * Playwright browser context for each VU. Increases CPU and memory usage.
   */
  useSeparateBrowserPerVU?: boolean;
  /**
   * Strip query strings from page URLs when generating metrics.
   * @default false
   */
  stripQueryString?: boolean;
  /**
   * Replace parameter values in query strings with placeholders when
   * generating metrics (numbers become NUMBER, strings become STRING).
   * @default true
   */
  normalizeQueryString?: boolean;
};

//
// Plugin configuration
//

/**
 * Plugin configuration. Built-in plugins are typed; third-party
 * plugin options are `unknown` until the plugin provides types.
 */
export type PluginsConfig = {
  expect?: ExpectPluginConfig;
  ensure?: EnsurePluginConfig;
  apdex?: ApdexPluginConfig;
  'metrics-by-endpoint'?: MetricsByEndpointPluginConfig;
  'publish-metrics'?: PublishMetricsPluginConfig;
  'fake-data'?: FakeDataPluginConfig;
  slack?: SlackPluginConfig;
  [plugin: string]: unknown;
};

/**
 * https://www.artillery.io/docs/reference/extensions/expect
 */
export type ExpectPluginConfig = {
  outputFormat?: 'pretty' | 'json' | 'prettyError' | 'silent';
  /**
   * @deprecated Use `outputFormat` instead.
   */
  formatter?: 'pretty' | 'json' | 'prettyError' | 'silent';
  /**
   * Report failures from the expect plugin as errors in the test report.
   * @default false
   */
  reportFailuresAsErrors?: boolean;
  /** Use request names instead of URL paths when logging requests. */
  useOnlyRequestNames?: boolean;
  /**
   * Set a 200 OK status code expectation for all requests by default.
   * @default false
   */
  expectDefault200?: boolean;
};

/**
 * Per-request expectations for the expect plugin.
 * https://www.artillery.io/docs/reference/extensions/expect#expectations
 */
export type ExpectPluginExpectations = {
  /** Expected response status code(s). */
  statusCode?: number | number[];
  /** Status code(s) the response must not have. */
  notStatusCode?: number | number[];
  /** Expected Content-Type. */
  contentType?: string;
  /** Property the response object must have. */
  hasProperty?: string;
  /** Property the response object must not have. */
  notHasProperty?: string;
  /** Check that two or more values are the same. */
  equals?: Array<string | number>;
  /** Header the response must include. */
  hasHeader?: string;
  /** Check a header value against a list. */
  headerEquals?: string[];
  /** Regular expression the response must match. */
  matchesRegexp?: string;
  /** Check the presence of a CDN cache hit/miss header. */
  cdnHit?: boolean;
};

/**
 * https://www.artillery.io/docs/reference/extensions/ensure
 */
export type EnsurePluginConfig = {
  /**
   * Threshold checks: metric name -> threshold value.
   * https://www.artillery.io/docs/reference/extensions/ensure#threshold-checks
   */
  thresholds?: Array<Record<string, number | string>>;
  /**
   * Conditional checks with full expressions.
   * https://www.artillery.io/docs/reference/extensions/ensure#advanced-conditional-checks
   */
  conditions?: Array<{
    expression: string;
    strict?: boolean;
  }>;
  /** Legacy basic check. */
  min?: number | string;
  /** Legacy basic check. */
  max?: number | string;
  /** Legacy basic check. */
  median?: number | string;
  /** Legacy basic check. */
  p95?: number | string;
  /** Legacy basic check. */
  p99?: number | string;
  /** Legacy basic check. */
  maxErrorRate?: number | string;
};

export type ApdexPluginConfig = {
  /** Response-time threshold (in milliseconds) for a "satisfying" response. */
  threshold?: number | string;
};

/**
 * https://www.artillery.io/docs/reference/extensions/metrics-by-endpoint
 */
export type MetricsByEndpointPluginConfig = {
  /**
   * Use request name property as endpoint name instead of the full URL.
   * @default false
   */
  useOnlyRequestNames?: boolean;
  /**
   * Strip query strings from endpoint names.
   * @default false
   */
  stripQueryString?: boolean;
  /**
   * Ignore per-endpoint metrics for requests without a name.
   * @default false
   */
  ignoreUnnamedRequests?: boolean;
  /**
   * Custom prefix for metrics published by this plugin.
   * @default "plugins.metrics-by-endpoint"
   */
  metricsNamespace?: string;
  /**
   * Group metrics by the non-templated request URL.
   * @default true
   */
  groupDynamicURLs?: boolean;
};

export type SlackPluginConfig = {
  webhookUrl?: string;
  notifyOnFailureOnly?: boolean;
};

/**
 * Configuration map of faker functions for the fake-data plugin.
 */
export type FakeDataPluginConfig = Record<string, unknown>;

export type PublishMetricsReporterType =
  | 'cloudwatch'
  | 'datadog'
  | 'newrelic'
  | 'splunk'
  | 'prometheus'
  | 'dynatrace'
  | 'honeycomb'
  | 'mixpanel'
  | 'statsd'
  | 'influxdb-statsd'
  | 'open-telemetry';

/**
 * https://www.artillery.io/docs/reference/extensions/publish-metrics
 * Reporter-specific options are not fully typed yet - see the docs for
 * each reporter type.
 */
export type PublishMetricsReporterConfig = {
  type: PublishMetricsReporterType;
  [option: string]: unknown;
};

export type PublishMetricsPluginConfig = PublishMetricsReporterConfig[];

//
// Processor (custom code) contracts
//

/**
 * Per-VU context passed to processor functions and Playwright test
 * functions.
 */
export type VUContext = {
  /** Variables available to the virtual user. */
  vars: Record<string, any>;
  /** Name of the scenario this VU is running (when set). */
  scenario?: Scenario;
  /** Internal engine state and ad-hoc values set by hooks. */
  [key: string]: any;
};

/**
 * Event emitter passed to processor functions for recording custom
 * metrics.
 * https://www.artillery.io/docs/guides/guides/extension-apis#tracking-custom-metrics
 */
export type VUEvents = {
  emit(
    metricType: 'counter' | 'histogram',
    metricName: string,
    metricValue: number
  ): void;
  emit(metricType: 'rate', metricName: string, metricValue?: number): void;
};

/** Callback that ends a hook function. */
export type HookDone = (err?: Error | null) => void;

/**
 * A scenario-level hook or `function` flow step:
 * either callback-style or async.
 */
export type ScenarioHookFunction = (
  context: VUContext,
  events: VUEvents,
  done: HookDone
) => unknown;

/**
 * HTTP response as seen by afterResponse hooks (got-based).
 */
export type HttpResponse = {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  [key: string]: any;
};

/**
 * A beforeRequest hook: modify request parameters before a request
 * is sent.
 */
export type BeforeRequestHookFunction = (
  requestParams: Record<string, any>,
  context: VUContext,
  events: VUEvents,
  done: HookDone
) => unknown;

/**
 * An afterResponse hook: inspect the response after it is received.
 */
export type AfterResponseHookFunction = (
  requestParams: Record<string, any>,
  response: HttpResponse,
  context: VUContext,
  events: VUEvents,
  done: HookDone
) => unknown;
