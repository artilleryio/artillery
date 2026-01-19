

const tap = require('tap');
const divideWork = require('../../lib/dist');

tap.test('divideWork for arrivalCount single phase', (t) => {
  const numWorkers = 5;
  const expectedWorkers = 1; // arrivalCount uses only the first worker
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [{ name: 'arrivalCount', duration: 10, arrivalCount: 5 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);

  t.equal(
    phases.length,
    expectedWorkers,
    'it distributes work to a single worker'
  );
  t.equal(
    phases.filter(
      (phase) =>
        phase.config.phases.length === script.config.phases.length &&
        'arrivalCount' in phase.config.phases[0]
    ).length,
    1,
    'arrivalCount is assigned to just one worker'
  );
  t.equal(phases.length, expectedWorkers, 'asleep workers are not returned');

  t.end();
});

tap.test('divideWork for arrivalCount multiple phases', (t) => {
  // The second phase garantees that all workers are used
  // i.e: no worker is sleeping in all phases
  const numWorkers = 5;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [
        { name: 'arrivalCount', duration: 10, arrivalCount: 5 },
        { name: 'keep-alive', duration: 10, arrivalRate: 10 }
      ]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);

  t.equal(phases.length, numWorkers, 'it distributes work to all workers');
  t.equal(
    phases.filter(
      (phase) =>
        phase.config.phases.length === script.config.phases.length &&
        'arrivalCount' in phase.config.phases[0]
    ).length,
    1,
    'arrivalCount is assigned to just one worker'
  );
  t.equal(
    phases.filter(
      (phase) =>
        phase.config.phases.length === script.config.phases.length &&
        'pause' in phase.config.phases[0]
    ).length,
    numWorkers - 1,
    'arrivalCount is replaced with a pause phase in all but one of the worker scripts'
  );

  t.ok(
    phases
      .slice(1)
      .every(
        (phase) =>
          'pause' in phase.config.phases[0] &&
          phase.config.phases[0].name === script.config.phases[0].name
      ),
    'pause phases created to replace arrivalCounts keep the same name as the original arrivalCount phase'
  );

  t.end();
});

tap.test('set max vusers', (t) => {
  const numWorkers = 5;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [
        { name: 'vusers', duration: 10, maxVusers: 20, arrivalRate: 100 }
      ]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);
  const actualVusers = phases.reduce(
    (partialSum, phase) => partialSum + phase.config.phases[0].maxVusers,
    0
  );
  t.equal(
    actualVusers,
    script.config.phases[0].maxVusers,
    'actual vusers should be equal to maxVusers'
  );
  t.end();
});

tap.test('arrivalRate defaults to zero if not present', (t) => {
  const numWorkers = 5;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [{ name: 'rampto', duration: 10, rampTo: 25 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);
  const totalArrivalRate = phases.reduce(
    (partialSum, phase) => partialSum + phase.config.phases[0].arrivalRate,
    0
  );

  t.equal(totalArrivalRate, 0, 'arrivalRate should be zero');
  t.end();
});

tap.test('maxVusers distributes evenly in all phases', (t) => {
  const numWorkers = 7;
  const maxVusers = 10;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [
        {
          name: 'rate small',
          duration: 10,
          arrivalRate: 2,
          maxVusers: maxVusers
        },
        {
          name: 'rate big',
          duration: 10,
          arrivalRate: 200,
          maxVusers: maxVusers
        },
        { name: 'rampto small', duration: 10, rampTo: 2, maxVusers: maxVusers },
        { name: 'rampto big', duration: 10, rampTo: 200, maxVusers: maxVusers },
        { name: 'count', duration: 10, arrivalCount: 25, maxVusers: maxVusers }
      ]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const phases = divideWork(script, numWorkers);
  for (let i = 0; i < script.config.phases.length; i++) {
    const activeMaxVusers = phases
      .map((p) => p.config.phases[i])
      .filter((p) => p.arrivalRate > 0 || p.arrivalCount > 0 || p.rampTo > 0)
      .reduce((sum, p) => sum + p.maxVusers, 0);
    t.equal(activeMaxVusers, 10, 'maxVusers is evenly distributed');
  }
  t.end();
});

tap.test('payload is distributet between workers and does not repeat', (t) => {
  const numWorkers = 7;
  const maxVusers = 10;
  const script = {
    config: {
      target: 'http://targ.get.url',
      phases: [
        {
          name: 'rate small',
          duration: 10,
          arrivalRate: 2,
          maxVusers: maxVusers
        },
        {
          name: 'rate big',
          duration: 10,
          arrivalRate: 200,
          maxVusers: maxVusers
        },
        { name: 'rampto small', duration: 10, rampTo: 2, maxVusers: maxVusers },
        { name: 'rampto big', duration: 10, rampTo: 200, maxVusers: maxVusers },
        { name: 'count', duration: 10, arrivalCount: 25, maxVusers: maxVusers }
      ],
      payload: [
        {
          data: [
            ['1', 'value-1'],
            ['2', 'value-2'],
            ['3', 'value-3'],
            ['4', 'value-4'],
            ['5', 'value-5'],
            ['6', 'value-6'],
            ['7', 'value-7'],
            ['8', 'value-8'],
            ['9', 'value-9'],
            ['10', 'value-10']
          ]
        }
      ]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/'
            }
          }
        ]
      }
    ]
  };

  const workerScripts = divideWork(script, numWorkers);
  const payloadSet = new Set();
  for (const script of workerScripts) {
    for (const payload of script.config.payload) {
      for (const data of payload.data) {
        t.ok(!payloadSet.has(data), 'payload is not repeated');
        payloadSet.add(data);
      }
    }
  }
  t.end();
});

tap.test(
  'payloads DO repeat when distributed between workers, when there are more workers than palyoads',
  (t) => {
    const numWorkers = 7;
    const maxVusers = 10;
    const script = {
      config: {
        target: 'http://targ.get.url',
        phases: [
          {
            name: 'rate small',
            duration: 10,
            arrivalRate: 2,
            maxVusers: maxVusers
          },
          {
            name: 'rate big',
            duration: 10,
            arrivalRate: 200,
            maxVusers: maxVusers
          },
          {
            name: 'rampto small',
            duration: 10,
            rampTo: 2,
            maxVusers: maxVusers
          },
          {
            name: 'rampto big',
            duration: 10,
            rampTo: 200,
            maxVusers: maxVusers
          },
          {
            name: 'count',
            duration: 10,
            arrivalCount: 25,
            maxVusers: maxVusers
          }
        ],
        payload: [
          {
            data: [
              ['1', 'value-1'],
              ['2', 'value-2'],
              ['3', 'value-3'],
              ['4', 'value-4'],
              ['5', 'value-5'],
              ['6', 'value-6']
            ]
          }
        ]
      },
      scenarios: [
        {
          flow: [
            {
              get: {
                url: '/'
              }
            }
          ]
        }
      ]
    };

    const workerScripts = divideWork(script, numWorkers);
    const palyoadCount = {};

    for (const script of workerScripts) {
      for (const payload of script.config.payload) {
        for (const data of payload.data) {
          const dataStr = data.join('');
          const count = palyoadCount[dataStr] || 0;
          palyoadCount[dataStr] = count + 1;
        }
      }
    }
    t.ok(
      Object.values(palyoadCount).some((count) => count > 1),
      'some payload is repeated'
    );

    t.end();
  }
);
