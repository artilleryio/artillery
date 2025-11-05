const portfinder = require('portfinder');
const { spawn } = require('node:child_process');

const startTestServer = async () => {
  const port = await portfinder.getPortPromise({
    port: 4444,
    stopPort: 4600
  });

  const childProcess = spawn('node', ['./test/server/server.js'], {
    env: {
      ...process.env,
      TEST_PORT: `${port}`
    },
    stdio: 'inherit'
  });

  return {
    currentPort: port,
    currentPid: childProcess.pid,
    childProcess
  };
};

module.exports = {
  startTestServer
};
