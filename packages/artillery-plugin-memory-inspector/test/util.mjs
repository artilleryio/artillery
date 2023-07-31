import portfinder from 'portfinder';
import { spawn } from 'child_process';

export const startTestServer = async () => {
  const port = await portfinder.getPortPromise({
    port: 4444,
    stopPort: 4600
  });

  const childProcess = spawn(`node`, ['./test/server/server.mjs'], {
    env: {
      ...process.env,
      TEST_PORT: `${port}`
    }
  });

  return {
    currentPort: port,
    currentPid: childProcess.pid,
    childProcess
  };
};
