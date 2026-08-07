// Ambient declarations for globals used across the monorepo.
// The `artillery` global object is set up by the core runtime
// (lib/core/update-global-object.ts) and extended by the CLI,
// workers, engines, plugins and cloud platforms.
//
// Known properties are typed below; the index signature is a
// deliberate escape hatch while call sites migrate to strict mode.
// Remove properties from the escape hatch by typing them here.

declare global {
  interface ArtilleryEventEmitterLike {
    on(event: string, listener: (...args: any[]) => void): unknown;
    once(event: string, listener: (...args: any[]) => void): unknown;
    off?(event: string, listener: (...args: any[]) => void): unknown;
    emit(event: string, ...args: any[]): unknown;
  }

  interface ArtilleryExtensionEvent {
    ext: string;
    method: (...args: any[]) => Promise<unknown>;
  }

  interface ArtilleryTelemetry {
    capture(event: string, properties?: Record<string, any>): void;
    [key: string]: any;
  }

  interface ArtilleryGlobal {
    version?: string;
    telemetry?: ArtilleryTelemetry;

    // Runtime options (legacy reporting, extended HTTP metrics, ...):
    runtimeOptions: Record<string, unknown> & {
      legacyReporting?: boolean;
      extendedHTTPMetrics?: boolean;
    };

    // Cross-component event bus:
    globalEvents: ArtilleryEventEmitterLike;

    // Extension hooks (beforeExit, onShutdown, ...):
    extensionEvents: ArtilleryExtensionEvent[];
    ext(event: ArtilleryExtensionEvent): Promise<void> | void;

    // Loaded plugin records. NOTE: used both as an array and as a keyed
    // map by different call sites - see modernization plan F17.
    plugins: any[];

    metrics: {
      event?(msg: string, opts: { level?: string }): Promise<void>;
      [key: string]: unknown;
    };

    util: {
      template?(input: unknown, context: unknown): unknown;
      [key: string]: unknown;
    };

    logger(opts: Record<string, unknown>): {
      log: (...args: unknown[]) => void;
    };
    log(...args: unknown[]): void;

    // Exit code accessor pair (suggestedExitCode setter relays to the
    // worker-thread parent when running inside a worker):
    suggestedExitCode: number;
    _exitCode: number;
    _workerThreadSend: ((data: unknown) => void) | null;

    shutdown(opts?: { earlyStop?: boolean; exitCode?: number }): Promise<void>;

    testRunId: string;

    // Escape hatch for not-yet-typed properties (cloud state, stash,
    // Playwright browser handles, TS processor bundle path, ...).
    // Do not add new usages; type new properties explicitly instead.
    [key: string]: any;
  }

  // eslint-disable-next-line no-var
  var artillery: ArtilleryGlobal;
}

export {};
