import portfinder from 'portfinder';
import { exec } from 'child_process';

export const startTestServer = async () => {
    const port = await portfinder.getPortPromise({
        port: 4444,
        stopPort: 4600
    });

    const childProcess = exec('node ./test/server/server.mjs', {
        env: {
          ...process.env,
          TEST_PORT: `${port}`
        }
    });

    return {
        currentPort: port,
        currentPid: childProcess.pid,
        childProcess
    }
}