const { Redis } = require('@upstash/redis');

async function init(details) {
  if (details) {
    return new Redis({ url: details.url, token: details.token });
  } else {
    return null;
  }
}

module.exports = { initStash: init };
