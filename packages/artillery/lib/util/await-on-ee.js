const sleep = require('./sleep');

async function awaitOnEE(ee, message, pollMs = 1000, maxWaitMs = Infinity) {
  let messageFired = false;
  let args = null;
  let waitedMs = 0;

  ee.once(message, () => {
    messageFired = true;
    args = arguments;
  });

  while (true && waitedMs < maxWaitMs) {
    if (messageFired) {
      break;
    }
    await sleep(pollMs);
    waitedMs += pollMs;
  }

  return args;
}

module.exports = awaitOnEE;
