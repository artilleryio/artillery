import sleep from './sleep.ts';

// Waits for an event, polling. Returns the event arguments, or null
// when maxWaitMs elapses first. NOTE: the timeout leaves the listener
// attached and does not reject - see modernization plan F17.
async function awaitOnEE(
  ee: {
    once(event: string, listener: (...args: any[]) => void): unknown;
  },
  message: string,
  pollMs = 1000,
  maxWaitMs = Infinity
): Promise<unknown[] | null> {
  let messageFired = false;
  let args: unknown[] | null = null;
  let waitedMs = 0;

  ee.once(message, (...eventArgs) => {
    messageFired = true;
    args = eventArgs;
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

export default awaitOnEE;
