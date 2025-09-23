import { Redis } from '@upstash/redis';

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

export {};
