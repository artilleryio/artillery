'use strict';

const createLauncher = require('../../../lib/launch-local');
const fs = require('fs');
const path = require('path');
const sinon = require('sinon');
const sleep = require('../../helpers/sleep');
const tap = require('tap');
const { ArtilleryWorker } = require('../../../lib/artillery-worker-local');

tap.test('multi period report', async (t) => {
  let done = false
  let report = {}
  const script = {
    config: {
      target: `http://127.0.0.1:1234`,
      phases: [{ duration: 1, arrivalRate: 1 }]
    }
  }; //dummy

  const fn = path.resolve(__dirname, '../../data/multi-period-local-report.json');
  const data = JSON.parse(
    fs.readFileSync(fn) 
  ); //loads total of 40 results in two different periods

  const runner = await createLauncher(script, {}, {'count': 2});
  runner.events.once('done', async (stats) => {
    await runner.shutdown();
    done = true;
    report = stats;
  });

  //mock run
  runner.workers = {}
  const w1 = sinon.stub(new ArtilleryWorker());
  const w2 = sinon.stub(new ArtilleryWorker());
  runner.workers = {
    "1": {
      id: 1,
      proc: w1,
      state: 'pending..',
      script },
    "2": {
      id: 2,
      proc: w2,
      state: 'pending..',
      script }
  };

  runner.initWorkerEvents(w1, {});
  runner.initWorkerEvents(w2, {});

  //mock worker done events and trigger final report
  w1.events.emit('done', data[0]);
  w2.events.emit('done', data[1]);

  while(!done){
    await sleep(100);
  }

  console.log(report)
  t.equal(report.counters['vusers.created'], 40, "vusers ok")
  t.equal(report.counters['http.requests'], 40, "requests ok")
  t.equal(report.counters['http.responses'], 40, "responses ok")
});

