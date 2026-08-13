import { Redis } from '@upstash/redis';
import { createClient } from './platform/cloud/api.ts';

type StashDetails = { url: string; token: string };

async function init(
  details: StashDetails | null | undefined
): Promise<Redis | null> {
  if (details) {
    return new Redis({ url: details.url, token: details.token });
  } else {
    return null;
  }
}

/**
 * Fetch Stash connection details from the Artillery Cloud API.
 *
 * Network calls happen here only. Call once in the main process and
 * pass the result to workers - workers construct their clients with
 * initStash() and make no cloud API calls of their own.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Artillery Cloud API key (optional, can use ARTILLERY_CLOUD_API_KEY env var)
 * @returns {Promise<StashDetails|null>}
 */
async function fetchStashDetails(
  options: any = {}
): Promise<StashDetails | null> {
  const cloud = createClient({
    apiKey: options.apiKey || process.env.ARTILLERY_CLOUD_API_KEY
  });

  const whoami = await cloud.whoami();
  if (!whoami.activeOrg) {
    return null;
  }

  return cloud.getStashDetails({ orgId: whoami.activeOrg });
}

/**
 * Get an Artillery Stash client instance
 *
 *
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Artillery Cloud API key (optional, can use ARTILLERY_CLOUD_API_KEY env var)
 * @returns {Promise<Redis|null>} - Redis client instance or null if not available
 */
async function getStash(options: any = {}) {
  return init(await fetchStashDetails(options));
}

export { init as initStash, fetchStashDetails, getStash };
export type { StashDetails };
