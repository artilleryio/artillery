const debug = require('debug')('console-capture');

function setupConsoleCapture() {
  let outputLines = [];
  let truncated = false;
  let currentSize = 0;
  let sendFromIndex = 0;

  const MAX_RETAINED_LOG_SIZE_MB = Number(
    process.env.MAX_RETAINED_LOG_SIZE_MB || '50'
  );
  const MAX_RETAINED_LOG_SIZE = MAX_RETAINED_LOG_SIZE_MB * 1024 * 1024;

  const interval = setInterval(() => {
    if (!truncated && outputLines.length - sendFromIndex > 0) {
      const newBatch = outputLines.slice(sendFromIndex, outputLines.length);
      sendFromIndex = outputLines.length;
      global.artillery.globalEvents.emit('logLines', newBatch, Date.now());
    }
  }, 10 * 1000).unref();

  global.artillery.ext({
    ext: 'onShutdown',
    method: async () => {
      debug('onBeforeExit', sendFromIndex, outputLines.length);
      clearInterval(interval);

      if (!truncated && sendFromIndex < outputLines.length) {
        const ts = Date.now();
        global.artillery.globalEvents.emit(
          'logLines',
          outputLines.slice(sendFromIndex, outputLines.length),
          ts,
          true
        );
        sendFromIndex = outputLines.length;
      }
    }
  });

  console.log = (() => {
    const orig = console.log;
    return () => {
      try {
        orig.apply(console, arguments);

        if (currentSize < MAX_RETAINED_LOG_SIZE) {
          outputLines = outputLines.concat(arguments);
          for (const x of arguments) {
            currentSize += String(x).length;
          }
        } else {
          if (!truncated) {
            truncated = true;
            const msg = `[WARNING] Artillery: maximum retained log size exceeded, max size: ${MAX_RETAINED_LOG_SIZE_MB}MB. Further logs won't be retained.\n\n`;
            process.stdout.write(msg);
            outputLines = outputLines.concat([msg]);
          }
        }
      } catch (err) {
        debug(err);
      }
    };
  })();

  console.error = (() => {
    const orig = console.error;
    return () => {
      try {
        orig.apply(console, arguments);

        if (currentSize < MAX_RETAINED_LOG_SIZE) {
          outputLines = outputLines.concat(arguments);
          for (const x of arguments) {
            currentSize += String(x).length;
          }
        } else {
          if (!truncated) {
            truncated = true;
            const msg = `[WARNING] Artillery: maximum retained log size exceeded, max size: ${MAX_RETAINED_LOG_SIZE_MB}MB. Further logs won't be retained.\n\n`;
            process.stdout.write(msg);
            outputLines = outputLines.concat([msg]);
          }
        }
      } catch (err) {
        debug(err);
      }
    };
  })();
}

module.exports = setupConsoleCapture;