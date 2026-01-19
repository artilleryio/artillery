import type { ExpectPluginConfig, ExpectPluginMetrics } from './plugins/expect';

export type TestScript = {
  /**
   * @title Configuration
   */
  config?: Config;

  /**
   * Optional scenarios to run once per test definition
   * before the main `scenarios` section.
   * @title Before
   */
  before?: Scenarios;

  /**
   * Optional scenarios to run once per test definition
   * after the main `scenarios` section.
   * @title After
   */
  after?: Scenarios;

  /**
   * @title Scenarios
   */
  scenarios?: Scenarios;
};

export type Config = {
  [key: string]: any;

  /**
   * Endpoint of the system under test, such as a hostname, IP address or a URI.
   * https://www.artillery.io/docs/reference/test-script#target---target-service
   * @title Target
   * @examples ["https://example.com", "ws://127.0.0.1"]
   */
  target: string;
  engines?: {
    playwright?: PlaywrightEngineConfig;
  };
  /**
   * A load phase defines how Artillery generates new virtual users (VUs) in a specified time period.
   * https://www.artillery.io/docs/reference/test-script#phases---load-phases
   * @title Phases
   */
  phases?: Array<TestPhase>;
  /**
   * Map of variables to expose to the test run.
   * https://www.artillery.io/docs/reference/test-script#variables---inline-variables
   * @title Variables
   */
  variables?: object;
  /**
   * List of Artillery plugins to use.
   * @title Plugins
   */
  plugins?: {
    [key: string]: any;
    expect?: ExpectPluginConfig;
  };
  ensure?: {
    [key: string]: any;
  };
  /**
   * Path to a CommonJS module to load for this test run.
   * @title Processor
   */
  processor?: string;
  /**
   * @title CSV payload
   */
  payload?: PayloadConfig | Array<PayloadConfig>;
  /**
   * @title TLS settings
   */
  tls?: {
    /**
     * Set this setting to `false` to tell Artillery to accept
     * self-signed TLS certificates.
     * @title Reject unauthorized connections
     * @default true
     */
    rejectUnauthorized?: boolean;
  };
  /**
   * @title HTTP configuration
   */
  http?: HttpConfig;
  /**
   * @title WebSocket configuration
   */
  ws?: WebSocketConfig;
};

export type PlaywrightEngineConfig = {
  /**
   * Arguments for the `browser.launch()` call in Playwright.
   * https://playwright.dev/docs/api/class-browsertype#browser-type-launch
   * @title Playwright launch options
   */
  launchOptions?: object;
  /**
   * Arguments for the `browser.newContext()` call in Playwright.
   * https://playwright.dev/docs/api/class-browser#browser-new-context
   * @title Playwright context options
   */
  contextOptions?: object;
  /**
   * Default maximum time (in seconds) for all Playwright methods
   * accepting the `timeout` option.
   * https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout
   * @title Default timeout
   */
  defaultTimeout?: number;
  /**
   * Default maximum navigation time (in seconds)
   * for Playwright navigation methods, like `page.goto()`.
   * https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-navigation-timeout
   * @title Default navigation timeout
   */
  defaultNavigationTimeout?: number;
  /**
   * When set, changes the attribute used by locator `page.getByTestId` in Playwright.
   * https://playwright.dev/docs/api/class-framelocator#frame-locator-get-by-test-id
   * @title Test ID Attribute
   */
  testIdAttribute?: string;
  /**
   * Aggregate Artillery metrics by test scenario name.
   * https://www.artillery.io/docs/reference/engines/playwright#aggregate-metrics-by-scenario-name
   * @title Aggregate by name
   */
  aggregateByName?: boolean;
};

export type PayloadConfig = {
  /**
   * Path to the CSV file.
   * @title Path
   */
  path: string;
  fields: Array<string>;
  /**
   * Controls how the CSV rows are selected for each virtual user.
   * @title Order
   * @default "random"
   * @example ["sequence", "random"]
   */
  random?: 'random' | 'sequence';
  /**
   * Set to `true` to make Artillery skip the first row in the CSV file
   * (typically the header row).
   * @title Skip header
   * @default false
   */
  skipHeader?: boolean;
  /**
   * Custom delimiter character to use in the payload.
   * @title Delimiter
   * @default ","
   */
  delimiter?: string;
  /**
   * Controls whether Artillery converts fields to native types
   * (e.g. numbers or booleans). To keep those fields as strings,
   * set this option to `false`.
   * @title Cast
   * @default true
   */
  cast?: boolean;
  /**
   * Controls whether Artillery should skip empty lines in the payload.
   * @title Skip empty lines
   * @default true
   */
  skipEmptyLines?: boolean;
} & (
  | { loadAll?: never; name?: never }
  | {
      loadAll: true;
      name: string;
    }
);

export type Scenarios = Array<Scenario>;

export type HttpConfig = {
  /**
   * Increase a decrease request timeout.
   * @title Request timeout
   * @default 10
   */
  timeout?: number;
  /**
   * Maximum amount of TCP connections per virtual user.
   * https://www.artillery.io/docs/reference/engines/http#max-sockets-per-virtual-user
   * @title Maximum sockets
   */
  maxSockets?: number;
  /**
   * Enable tracking additional HTTP metrics.
   * @title Extended metrics
   */
  extendedMetrics?: boolean;

  /**
   * https://www.artillery.io/docs/reference/engines/http#default-configuration
   * @title Default HTTP engine configuration
   */
  defaults?: {
    /**
     * Default headers to be used in all requests.
     * @title Headers
     */
    headers?: object;
    /**
     * Default cookies to be used in all requests.
     * @title Cookie
     */
    cookie?: object;
    /**
     * Whether to turn on strict capture by default
     * for all captures.
     * https://www.artillery.io/docs/reference/engines/http#turn-off-strict-capture
     * @default false
     * @title Strict capture
     */
    strictCapture?: boolean | string;
    /**
     * Sets jitter to simulate real-world random variance
     * into think time pauses. Accepts both number and percentage.
     * @title Think
     */
    think?: {
      jitter: number | string;
    };
  };
};

export type WebSocketConfig = {
  /**
   * @title WebSocket sub-protocols
   */
  subprotocols?: Array<'json' | 'soap' | 'wamp'>;
  /**
   * @title Headers
   */
  headers?: object;
  /**
   * @title Proxy
   */
  proxy?: {
    /**
     * @title URL
     */
    url: string;
  };
};

export type TestPhase = {
  /**
   * @title Test phase name
   */
  name?: string;
} & (
  | {
      /**
       * Test phase duration (in seconds).
       * Can also be any valid [human-readable duration](https://www.npmjs.com/package/ms).
       * @title Duration
       */
      duration: number | string;
      /**
       * Constant arrival rate.
       * The number of virtual users generated every second.
       * @title Arrival rate
       */
      arrivalRate?: number | string;
      /**
       * Fixed number of virtual users.
       * @title Arrival count
       */
      arrivalCount?: number | string;
      /**
       * @title Ramp rate
       */
      rampTo?: number | string;
      /**
       * Maximum number of virtual users generated at any given time.
       * @title Maximum virtual users
       */
      maxVusers?: number | string;
    }
  | {
      /**
       * Pause the test phase execution for given duration (in seconds).
       * Can also be any valid [human-readable duration](https://www.npmjs.com/package/ms).
       * @title Pause
       */
      pause: number | string;
    }
);

export type Scenario = {
  /**
   * @title Scenario name
   */
  name?: string;
  /**
   * Functions to run before each scenario.
   * @title `beforeScenario` hook
   */
  beforeScenario?: string | Array<string>;
  /**
   * Functions to run before after scenario.
   * @title `afterScenario` hook
   */
  afterScenario?: string | Array<string>;
  /**
   * The probability of how often this scenario will be picked up.
   * The higher the number, the more likely it will be used
   * compared to other scenarios.
   * @title Weight
   * @default 1
   */
  weight?: number;
} & (
  | {
      /**
       * @title HTTP engine
       */
      engine?: 'http';
      /**
       * @title Scenario flow
       */
      flow: Array<
        | HttpFlow
        | ({
            loop: Array<HttpFlow>;
            whileTrue?: string;
          } & (FixedLoop | DynamicLoop))
      >;
    }
  | {
      /**
       * @title WebSocket engine
       */
      engine: 'websocket' | 'ws';
      /**
       * @title Scenario flow
       */
      flow: Array<
        | WebSocketFlow
        | ({
            loop: Array<WebSocketFlow>;
            whileTrue?: string;
          } & (FixedLoop | DynamicLoop))
      >;
    }
  | {
      /**
       * @title Socket.io engine
       */
      engine: 'socketio';
      /**
       * @title Scenario flow
       */
      flow: Array<
        | HttpFlow
        | SocketIoFlow
        | ({
            loop: Array<HttpFlow | SocketIoFlow>;
            whileTrue?: string;
          } & (FixedLoop | DynamicLoop))
      >;
    }
  | {
      /**
       * @title Playwright engine
       */
      engine: 'playwright';
      /**
       * @title Test function
       */
      testFunction?: string;
      /**
       * @title Flow function
       */
      flowFunction?: string;
    }
);

export type FixedLoop = {
  /**
   * Exact number of times to loop through the scenario.
   * @title Count
   */
  count: number;
};

export type DynamicLoop = {
  /**
   * Array of values to loop through.
   * Alternatively, a name of the variable containing the array.
   * @title Over
   */
  over: string | Array<string>;
};

export type BaseFlow =
  | {
      /**
       * Print given message to the console.
       * @title Log
       */
      log: string;
    }
  | {
      /**
       * Pause virual user for the given duration (in seconds).
       * @title Think
       */
      think: number;
    }
  | {
      /**
       * Function name to run.
       * @title Function
       */
      function: string;
    };

export type HttpResponseMatch = {
  json: any;
  value: string;
};

export type HttpFlow =
  | BaseFlow
  | {
      /**
       * @title Perform a GET request
       */
      get: DefaultHttpRequest;
    }
  | {
      /**
       * @title Perform a POST request
       */
      post: DefaultHttpRequest | HttpRequestWithBody;
    }
  | {
      /**
       * @title Perform a PUT request
       */
      put: DefaultHttpRequest | HttpRequestWithBody;
    }
  | {
      /**
       * @title Perform a PATCH request
       */
      patch: DefaultHttpRequest | HttpRequestWithBody;
    }
  | {
      /**
       * @title Perform a DELETE request
       */
      delete: DefaultHttpRequest | HttpRequestWithBody;
    };

export type WebSocketFlow =
  | BaseFlow
  | {
      connect:
        | string
        | {
            function: string;
          }
        | {
            target: string;
            proxy?: {
              url: string;
            };
          };
    }
  | {
      send: string | object;
    };

export type SocketIoFlow =
  | BaseFlow
  | {
      emit: {
        channel: string;
        data: string;
        namespace?: string;
        response?: {
          channel: string;
          data: string;
        };
        acknowledge?: {
          data?: string;
          match?: HttpResponseMatch;
        };
      };
    };

export type DefaultHttpRequest = {
  /**
   * @title URL
   */
  url: string;
  /**
   * @title Headers
   */
  headers?: object;
  /**
   * @title Cookie
   */
  cookie?: {
    [name: string]: string;
  };
  /**
   * @title Query string
   */
  qs?: object;
  /**
   * Artillery follows redirects by default.
   * Set this option to `false` to stop following redirects.
   * @title Disable redirect following
   */
  followRedirect?: false;
  /**
   * @title Capture
   */
  capture?: TestPhaseCapture | Array<TestPhaseCapture>;
  /**
   * (Deprecated) Response validation criteria.
   * Please use the expectations plugin instead:
   * https://www.artillery.io/docs/reference/extensions/expect
   * @deprecated true
   * @title Match
   */
  match?: HttpResponseMatch;
  /**
   * Automatically set the "Accept-Encoding" request header
   * and decode compressed responses encoded with gzip.
   * @title Compression
   */
  gzip?: boolean;
  /**
   * @title Basic authentication
   */
  auth?: {
    /**
     * @title Username
     */
    user: string;
    /**
     * @title Password
     */
    pass: string;
  };
  /**
   * Functions to run before every request is sent.
   * @title Before request
   */
  beforeRequest?: string | Array<string>;
  /**
   * Functions to run after every response is received.
   * @title After response
   */
  afterResponse?: string | Array<string>;
  /**
   * Expression that controls when to execute this request.
   * @title Request condition
   */
  ifTrue?: string;

  /**
   * Plugin-specific properties.
   */

  /**
   * https://www.artillery.io/docs/reference/extensions/expect#expectations
   * @title Expect plugin expectations
   */
  expect?: ExpectPluginMetrics | Array<ExpectPluginMetrics>;
};

export type HttpRequestWithBody = DefaultHttpRequest &
  (
    | {
        /**
         * @title JSON response body
         */
        json: any;
      }
    | {
        /**
         * @title Raw response body
         */
        body: any;
      }
    | {
        form: object;
      }
    | {
        formData: object;
      }
  );

export type TestPhaseCapture =
  | {
      as: string;
      strict?: boolean;
    }
  | {
      json: string;
    }
  | {
      xpath: string;
    }
  | {
      regexp: string;
    }
  | {
      header: string;
    }
  | {
      selector: string;
    };
