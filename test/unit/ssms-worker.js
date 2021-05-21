/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The worker process receives counter/rate/histogram measurements
// to record, and posts back metric summaries for buckets as they
// become available.

const {
  isMainThread, parentPort, threadId
} = require('worker_threads');

const { sleep } = require('../cli/_helpers');

const { SSMS } = require('../../core/lib/ssms');

if(isMainThread) {
  console.log(`# This script should be run as a worker thread, exiting`);
  process.exit(1);
}

console.log(`# [${threadId}] ssms-worker started`)

async function main() {
  const mdb = new SSMS();

  mdb.on('metricData', (bucket, metricData) => {
    parentPort.postMessage({event: 'metricData', bucket: bucket, metricData: SSMS.serializeMetrics(metricData)});
  });

  parentPort.on('message', async (message) => {
    if (message.cmd === 'incr') {
      mdb.incr(message.name, message.value, message.ts);
    } else if (message.cmd === 'histogram') {
      mdb.histogram(message.name, message.value, message.ts);
    }
    else if (message.cmd === 'rate') {
      mdb.rate(message.name, message.ts);
    }
    else if (message.cmd === 'exit') {
      mdb.aggregate(true);
      mdb.stop();

      await sleep(500);

      process.nextTick(() => {
        process.exit(0);
      });

    } else {
      console.log(`# [${threadId}] worker got unknown command: ${cmd}`);
    }
  });
}

main();