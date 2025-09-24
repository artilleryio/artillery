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
  var artillery: {
    /**
     * Artillery Cloud Stash API client (Redis-compatible)
     * Available when Artillery is run with --key flag, on Business and Enterprise plans
     * Set to null otherwise.
     */
    stash: Stash;
  };
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

export type Config = {
  [key: string]: any;

  /**
   * Endpoint of the system under test, such as a hostname or IP address.
   * https://www.artillery.io/docs/reference/test-script#target---target-service
   */
  target: string;
  engines?: {
    playwright?: PlaywrightEngineConfig;
  };
  /**
   * A load phase defines how Artillery generates new virtual users (VUs) in a specified time period.
   * https://www.artillery.io/docs/reference/test-script#phases---load-phases
   */
  phases?: Array<TestPhase>;
  /**
   * Map of variables to expose to the test run.
   * https://www.artillery.io/docs/reference/test-script#variables---inline-variables
   */
  variables?: object;
  /**
   * List of Artillery plugins to use.
   */
  plugins?: {
    [key: string]: any;
  };
  ensure?: {
    [key: string]: any;
  };
  /**
   * Path to a CommonJS/ESM/TypeScript module to load for this test run.
   * @deprecated
   */
  processor?: string;
  /**
   * CSV payload definition
   */
  payload?: PayloadConfig | Array<PayloadConfig>;
  /**
   * TLS settings
   */
  tls?: {
    /**
     * Set this setting to `false` to tell Artillery to accept
     * self-signed TLS certificates.
     * Reject unauthorized connections
     * @default true
     */
    rejectUnauthorized?: boolean;
  };
};

export type Scenario = {
  /**
   * Scenario name
   */
  name?: string;
  /**
   * Functions to run before each scenario.
   */
  beforeScenario?: string | Array<string>;
  /**
   * Functions to run after each scenario.
   */
  afterScenario?: string | Array<string>;
  /**
   * The probability of how often this scenario will be picked up.
   * The higher the number, the more likely it will be used
   * compared to other scenarios.
   * @default 1
   */
  weight?: number;
} & {
  /**
   * Playwright engine
   */
  engine: 'playwright';
  /**
   * Test function
   */
  testFunction?: PlaywrightEngineScenarioTestFunction;
  /**
   * Flow function
   * @deprecated Use testFunction attribute instead
   */
  flowFunction?: PlaywrightEngineScenarioTestFunction;
};

export type PlaywrightEngineScenarioTestFunction = string | ((page: Page, userContext: VUContext, events: VUEvents, test: PlaywrightEngineTestParam) => Promise<void>);

export type VUContext = {
  [key: string]: any;
  vars: Record<string, any>;
};

export type VUEvents = {
  emit: (metricType: 'counter' | 'histogram' | 'rate', metricName: string, metricValue: number) => void;
};

export type PlaywrightEngineTestParam = {
  step: (stepName: string, userActions: Function) => Promise<void>
};

export type PlaywrightEngineConfig = {
  /**
   * Arguments for the `browser.launch()` call in Playwright.
   * https://playwright.dev/docs/api/class-browsertype#browser-type-launch
   */
  launchOptions?: object;
  /**
   * Arguments for the `browser.newContext()` call in Playwright.
   * https://playwright.dev/docs/api/class-browser#browser-new-context
   */
  contextOptions?: object;
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
   * Report additional browser metrics
   * https://www.artillery.io/docs/reference/engines/playwright#extended-metrics
   */
  extendedMetrics?: boolean;
  /**
   * Show metrics for all domains & pages. When enabled, metrics for iframes and pages not hosted on the base URL will be reported.
   * https://www.artillery.io/docs/reference/engines/playwright#playwright--browser-configuration-options
   */
  showAllPageMetrics?: boolean;
  /**
   * Launch a separate browser for each new VU, rather than using a new Playwright browser context for each VU.
   * Enabling this setting is not recommended as it will increase CPU and memory usage.
   * https://www.artillery.io/docs/reference/engines/playwright#playwright--browser-configuration-options
   */
  useSeparateBrowserPerVU?: boolean;
};

type PlaywrightEngineTraceConfig = {
  /**
   * Enable Playwright trace recording
   * @default false
   */
  enabled?: boolean;
  /**
   * Max number of active VUs recording a trace
   * @default 3
   */
  maxConcurrentRecordings: number;
}

export type TestPhase = {
  /**
   * Test phase name
   */
  name?: string;
} & (
  | {
      /**
       * Test phase duration (in seconds).
       * Can also be any valid [human-readable duration](https://www.npmjs.com/package/ms).
       */
      duration: number | string;
      /**
       * Constant arrival rate.
       * The number of virtual users generated every second.
       */
      arrivalRate?: number | string;
      /**
       * Fixed number of virtual users.
       */
      arrivalCount?: number | string;
      /**
       * Ramp rate
       */
      rampTo?: number | string;
      /**
       * Maximum number of virtual users active at once
       */
      maxVusers?: number | string;
    }
  | {
      /**
       * Pause the test phase execution for given duration (in seconds).
       * Can also be any valid [human-readable duration](https://www.npmjs.com/package/ms).
       */
      pause: number | string;
    }
);

export type PayloadConfig = {
  /**
   * Path to the CSV file.
   */
  path: string;
  fields: Array<string>;
  /**
   * Controls how the CSV rows are selected for each virtual user.
   * @default "random"
   */
  random?: 'random' | 'sequence';
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
      loadAll: true;
      name: string;
    }
);

export {};