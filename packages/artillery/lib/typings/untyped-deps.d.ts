// Ambient declarations for dependencies that ship no usable types.
//
// Two groups:
//
// 1. Libraries with no @types package (driftless, arrivals,
//    socketio-wildcard, deep-for-each, walk-sync, espree) or with
//    types that Node16+ resolution cannot reach (hpagent: "types"
//    field exists but the exports map has no "types" condition).
//
// 2. Libraries whose DefinitelyTyped packages fight this codebase's
//    current (pre-strict) usage patterns: @types/async v3 generics
//    infer `unknown` accumulators through waterfall/each chains, and
//    @types/ms v2 template-literal string types reject dynamic input.
//    These get deliberately permissive signatures here - matching
//    today's implicit-any behavior - until call sites are typed.
//    Tighten alongside the strict migration (see modernization plan).
//
// `any` in callback parameter positions below is deliberate: it keeps
// the loose build identical to the previous implicit-any behavior
// while eliminating TS7016 (untyped module) diagnostics under strict.

declare module 'async' {
  type AsyncCallback = (err?: Error | null, result?: any) => void;

  interface AsyncModule {
    waterfall(
      tasks: Array<(...args: any[]) => void>,
      callback?: AsyncCallback
    ): void;
    series(
      tasks: Array<(callback: AsyncCallback) => void>,
      callback?: AsyncCallback
    ): void;
    whilst(
      test: (...args: any[]) => any,
      iterator: (callback: AsyncCallback) => void,
      callback?: (err: Error | null | undefined, ...results: any[]) => void
    ): void;
    each(
      items: any,
      iterator: (item: any, callback: AsyncCallback) => void,
      callback?: AsyncCallback
    ): void;
    eachSeries(
      items: any,
      iterator: (item: any, callback: AsyncCallback) => void,
      callback?: AsyncCallback
    ): void;
    eachLimit(
      items: any,
      limit: number,
      iterator: (item: any, callback: AsyncCallback) => void,
      callback?: AsyncCallback
    ): void;
    parallelLimit(
      tasks: Array<(callback: AsyncCallback) => void>,
      limit: number,
      callback?: AsyncCallback
    ): void;
    constant(...values: any[]): (...args: any[]) => void;
  }

  const async: AsyncModule;
  export = async;
}

declare module 'ms' {
  // Real API: ms(string) -> number (parse), ms(number) -> string (format).
  // Callers here pass dynamic strings; @types/ms's template-literal
  // StringValue type rejects those.
  function ms(value: string): number;
  function ms(value: number): string;
  export = ms;
}

declare module 'driftless' {
  interface Driftless {
    setDriftlessTimeout(
      fn: (...args: any[]) => void,
      delayMs: number,
      ...params: any[]
    ): number;
    setDriftlessInterval(
      fn: (...args: any[]) => void,
      delayMs: number,
      ...params: any[]
    ): number;
    clearDriftless(
      id: number,
      options?: { customClearTimeout?: (id: number) => void }
    ): void;
  }
  const driftless: Driftless;
  export = driftless;
}

declare module 'arrivals' {
  import { EventEmitter } from 'node:events';

  // Emits 'arrival' and 'finished'.
  interface ArrivalProcess extends EventEmitter {
    start(): ArrivalProcess;
    stop(): ArrivalProcess;
  }

  interface Arrivals {
    uniform: {
      process(tickIntervalMs: number, durationMs?: number): ArrivalProcess;
    };
    poisson: { process(meanMs: number, durationMs?: number): ArrivalProcess };
  }

  const arrivals: Arrivals;
  export = arrivals;
}

declare module 'socketio-wildcard' {
  // Returns a patch function; called with a Manager to patch a client.
  function wildcard(managerOrServer?: unknown): (socket: unknown) => void;
  export = wildcard;
}

declare module 'deep-for-each' {
  function deepForEach(
    value: any,
    fn: (value: any, key: string, subject: any, path: string) => void
  ): void;
  export = deepForEach;
}

declare module 'walk-sync' {
  interface WalkSyncEntry {
    relativePath: string;
    basePath: string;
    size: number;
    mtime: number;
    mode: number;
    isDirectory(): boolean;
  }

  interface WalkSyncOptions {
    globs?: string[];
    directories?: boolean;
    ignore?: string[];
    includeBasePath?: boolean;
  }

  function walkSync(baseDir: string, options?: WalkSyncOptions): string[];

  namespace walkSync {
    function entries(
      baseDir: string,
      options?: WalkSyncOptions
    ): WalkSyncEntry[];
  }

  export = walkSync;
}

declare module 'espree' {
  // Minimal surface for template function-call parsing in
  // lib/commons/engine_util.ts. ESTree nodes kept loose.
  export interface Node {
    type: string;
    [key: string]: any;
  }

  export interface Program extends Node {
    type: 'Program';
    body: Node[];
  }

  export function parse(
    code: string,
    options?: Record<string, unknown>
  ): Program;
}

declare module 'hpagent' {
  // Copied from hpagent's own index.d.ts, which Node16+ module
  // resolution cannot see (exports map lacks a "types" condition).
  import * as http from 'node:http';
  import * as https from 'node:https';

  export interface HttpProxyAgentOptions extends http.AgentOptions {
    proxy: string | URL;
    proxyRequestOptions?: Record<string, unknown>;
  }

  export interface HttpsProxyAgentOptions extends https.AgentOptions {
    proxy: string | URL;
    proxyRequestOptions?: Record<string, unknown>;
  }

  export class HttpProxyAgent extends http.Agent {
    constructor(options: HttpProxyAgentOptions);
  }

  export class HttpsProxyAgent extends https.Agent {
    constructor(options: HttpsProxyAgentOptions);
  }
}
