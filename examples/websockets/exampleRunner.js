#!/usr/bin/env node
const { spawn } = require('node:child_process');

const [serverCommand, serverUrl, testCommand] = process.argv.slice(2);

if (!serverCommand) {
  throw new Error('Failed to run the test: server command missing');
}

if (!serverUrl) {
  throw new Error('Failed to run the test: server URL is missing');
}

if (!testCommand) {
  throw new Error('Failed to run the test: test command is missing');
}

async function run() {
  // 1. Spawn the server process.
  const serverProcess = spawn('npm', ['run', serverCommand], {
    shell: '/bin/bash',
    stdio: 'inherit'
  });

  serverProcess.on('error', (error) => {
    console.error(error);
    throw new Error(
      'Failed to spawn the test server. See the error output above.'
    );
  });

  const cleanup = () => {
    if (!serverProcess.killed) {
      serverProcess.kill();
    }
  };

  process
    .on('SIGTERM', cleanup)
    .on('SIGINT', cleanup)
    .on('exit', cleanup)
    .on('unhandledRejection', (error) => {
      cleanup();
      throw error;
    });

  // 2. Ping the server to respond with anything but 5xx.
  // This is the main difference from the "start-server-and-test" since
  // the server of some of our scenarios won't respond with 200
  // (e.g. the WebSocket server responds with 426, rightfully).
  await ping(serverUrl);

  // 3. Run the test command.
  const testProcess = spawn('npm', ['run', testCommand], {
    shell: '/bin/bash',
    stdio: 'inherit'
  });

  testProcess.on('exit', cleanup);
}

async function ping(url, retriesLeft = 3) {
  return fetch(url, { method: 'HEAD' })
    .then((response) => response.status)
    .catch(async () => {
      retriesLeft--;

      if (retriesLeft === 0) {
        throw new Error(
          `Failed to ping the server at "${url}": server did not respond`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      return ping(url, retriesLeft);
    });
}

run();
