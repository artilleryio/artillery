const sleep = require('./sleep');

async function awaitOnEE(ee, message, pollMs = 1000) {
  let messageFired = false;
  let args = null;

  ee.once(message, () => {
    messageFired = true;
    args = arguments;
  });

  while (true) {
    if (messageFired) {
      break;
    }
    await sleep(pollMs);
  }

  return args;
}

module.exports = awaitOnEE;
