export type TestScript = {
  /**
   * @title Configuration
   */
  config?: Config;
  /**
   * @title Scenarios
   */
  scenarios: Scenarios;
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
  /**
   * A load phase defines how Artillery generates new virtual users (VUs) in a specified time period.
   * https://www.artillery.io/docs/reference/test-script#phases---load-phases
   * @title Phases
   */
  phases: Array<TestPhase>;
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
    [key: string]: object;
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

export type PayloadConfig = {
  /**
   * Path to the CSV file.
   * @title Path
   */
  path: string;
  fields: object;
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
  loadAll?: boolean;
  name?: string;
} & {
  loadAll: true;
  name: string;
};

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
       * @title Duration
       */
      duration: number;
      /**
       * Constant arrival rate.
       * The number of virtual users generated every second.
       * @title Arrival rate
       */
      arrivalRate?: number;
      /**
       * Fixed number of virtual users.
       * @title Arrival count
       */
      arrivalCount?: number;
      /**
       * @title Ramp rate
       */
      rampTo?: number;
      /**
       * Maximum number of virtual users generated at any given time.
       * @title Maximum virtual users
       */
      maxVusers?: number;
    }
  | {
      /**
       * Pause the test phase execution for given duration (in seconds).
       * @title Pause
       */
      pause: number;
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
       * @title Engine
       */
      engine: 'http';
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
       * @title Engine
       */
      engine: 'websocket' | 'ws';
      /**
       * @title Scenario flow
       */
      flow: Array<
        | HttpFlow
        | WebSocketFlow
        | ({
            loop: Array<HttpFlow | WebSocketFlow>;
            whileTrue?: string;
          } & (FixedLoop | DynamicLoop))
      >;
    }
  | {
      /**
       * @title Engine
       */
      engine: 'socketio';
      /**
       * @title Scenario flow
       */
      flow: Array<
        | SocketIoFlow
        | ({
            loop: Array<SocketIoFlow>;
            whileTrue?: string;
          } & (FixedLoop | DynamicLoop))
      >;
    }
  | {
      /**
       * @title Engine
       */
      engine: 'playwright';
      /**
       * @title Scenario flow
       */
      flow: Array<
        | any
        | ({
            loop: Array<any>;
            whileTrue?: string;
          } & (FixedLoop | DynamicLoop))
      >;
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
          match?: {
            json: any;
            value: string;
          };
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
  cookie?: Record<string, string>;
  /**
   * @title Query string
   */
  qs?: object;
  /**
   * Artillery follows redirects by default.
   * Set this option to `false` to stop following redirects.
   * @title Disable redirect following
   */
  followRedirects?: false;
  /**
   * @title Capture
   */
  capture?: TestPhaseCapture | Array<TestPhaseCapture>;
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
