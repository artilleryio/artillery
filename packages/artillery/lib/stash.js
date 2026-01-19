const { Redis } = require('@upstash/redis');
const { createClient } = require('./platform/cloud/api');

async function init(details) {
  if (details) {
    return new Redis({ url: details.url, token: details.token });
  } else {
    return null;
  }
}

/**
 * Get an Artillery Stash client instance
 *
 *
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - Artillery Cloud API key (optional, can use ARTILLERY_CLOUD_API_KEY env var)
 * @returns {Promise<Redis|null>} - Redis client instance or null if not available
 */
async function getStash(options = {}) {
  const cloud = createClient({
    apiKey: options.apiKey || process.env.ARTILLERY_CLOUD_API_KEY
  });

  const whoami = await cloud.whoami();
  if (!whoami.activeOrg) {
    return null;
  }

  const stashDetails = await cloud.getStashDetails({
    orgId: whoami.activeOrg
  });

  if (!stashDetails) {
    return null;
  }

  return init(stashDetails);
}

module.exports = { initStash: init, getStash };
