'use strict';

const { test, beforeEach } = require('tap');
const runner = require('../..').runner.runner;
const nock = require('nock');
const uuid = require('uuid');
const { SSMS } = require('../../lib/ssms');

let xmlCapture = null;
try {
  xmlCapture = require('artillery-xml-capture');
} catch (e) {}

beforeEach(() => nock.cleanAll());

test('Capture - headers', (t) => {
  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 1, arrivalRate: 1 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/header',
              capture: { header: 'x-auth', as: 'authToken' }
            }
          },
          {
            get: {
              url: '/expectsHeader',
              headers: { 'x-auth': '{{ authToken }}' }
            }
          }
        ]
      }
    ]
  };

  const xAuthHeader = 'secret';

  const target = nock(script.config.target)
    .get('/header')
    .reply(200, 'ok', { 'x-auth': 'secret' })
    .get('/expectsHeader')
    .reply(200, function () {
      t.equal(
        this.req.headers['x-auth'],
        xAuthHeader,
        'the captured header should be sent to the next url'
      );

      return { success: true };
    });

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok(target.isDone(), 'Should have made a request to all the endpoints');
      t.equal(report.codes[200], 2, 'Should do expected number of requests');
      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('Capture - selector', (t) => {
  const productLinks = Array(20)
    .fill()
    .map((_, idx) => `/product/${idx}`);

  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 1, arrivalRate: 5 }]
    },
    scenarios: [
      {
        flow: [
          {
            get: {
              url: '/productLinks',
              capture: {
                selector: 'a[class^=productLink]',
                index: 'random',
                attr: 'href',
                as: 'productLink'
              }
            }
          },
          {
            get: {
              url: '{{ productLink }}'
            }
          }
        ]
      }
    ]
  };

  const target = nock(script.config.target)
    .persist()
    .get('/productLinks')
    .reply(
      200,
      `<!DOCTYPE html>
          <html>
          <body>

          ${productLinks
            .map(
              (link) =>
                `<div><a class="productLink" href="${link}">${link}</a></div>`
            )
            .join('')}

          </body>
        </html>`,
      { 'content-type': 'text/html' }
    )
    .get(/product\/[^\/]+$/)
    .reply(function (uri) {
      if (productLinks.includes(uri)) {
        return [200];
      }

      return [404];
    });

  runner(script).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok(target.isDone(), 'Should have made a request to all the endpoints');
      t.equal(
        report.codes[200],
        script.config.phases[0].arrivalRate *
          script.config.phases[0].duration *
          script.scenarios[0].flow.length,
        'Number of 200 requests should be equal to arrivalRate*duration*numberOfRequests'
      );
      t.ok(report.codes[404] === undefined, 'it should only hit existing urls');

      ee.stop().then(() => {
        t.end();
      });
    });
    ee.run();
  });
});

test('Capture - JSON', (t) => {
  const db = {};
  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 2, arrivalRate: 5 }],
      payload: {
        fields: ['species', 'name']
      },
      variables: {
        jsonPathExpr: ['$.id']
      }
    },
    scenarios: [
      {
        name: "Create a pet and verify it's been created (JSON).",
        flow: [
          {
            post: {
              url: '/pets',
              json: { name: '{{ name }}', species: '{{ species }}' },
              capture: [
                {
                  json: '{{{ jsonPathExpr }}}',
                  as: 'id'
                },
                {
                  json: '$.doesnotexist',
                  as: 'doesnotexist',
                  strict: false
                },
                {
                  regexp: '.+',
                  as: 'id2'
                }
              ]
            }
          },
          {
            get: {
              url: '/pets/{{ id }}'
            }
          }
        ]
      }
    ]
  };

  let id;
  const target = nock(script.config.target)
    .persist()
    .post('/pets', function (body) {
      id = uuid.v4();
      db[id] = {
        ...body,
        id
      };

      return true;
    })
    .reply(201, function () {
      return { id };
    })
    .get(/pets\/[^\/]+$/)
    .reply(200);

  const data = [
    ['dog', 'Leo'],
    ['dog', 'Figo'],
    ['dog', 'Mali'],
    ['cat', 'Chewbacca'],
    ['cat', 'Puss'],
    ['cat', 'Bonnie'],
    ['cat', 'Blanco'],
    ['pony', 'Tiki']
  ];

  runner(script, data, {}).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok(report.codes[201] > 0, 'There should be 201s in the test');
      t.equal(
        report.codes[200],
        report.codes[201],
        'There should be a 200 for every 201'
      );
      t.ok(target.isDone(), 'Should have made a request to all the endpoints');

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});

test('Capture and save to attribute of an Object in context.vars - JSON', (t) => {
  const db = {};
  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 1, arrivalRate: 1 }],
      payload: {
        fields: ['species', 'name']
      },
      variables: {
        jsonPathExpr: ['$.id']
      }
    },
    scenarios: [
      {
        name: "Create a pet and verify it's been created by using pet object with id attribute (JSON).",
        flow: [
          {
            post: {
              url: '/pets',
              json: { name: '{{ name }}', species: '{{ species }}' },
              capture: [
                {
                  json: '{{{ jsonPathExpr }}}',
                  as: 'pet[id]'
                },
                {
                  json: '$.doesnotexist',
                  as: 'doesnotexist',
                  strict: false
                },
                {
                  regexp: '.+',
                  as: 'id2'
                }
              ]
            }
          },
          {
            get: {
              url: '/pets/{{ pet.id }}'
            }
          }
        ]
      }
    ]
  };

  let id;
  const target = nock(script.config.target)
    .persist()
    .post('/pets', function (body) {
      id = uuid.v4();
      db[id] = {
        ...body,
        id
      };

      return true;
    })
    .reply(201, function () {
      return { id };
    })
    .get(/pets\/[^\/]+$/)
    .reply(200);

  const data = [
    ['dog', 'Leo'],
    ['dog', 'Figo'],
    ['dog', 'Mali'],
    ['cat', 'Chewbacca'],
    ['cat', 'Puss'],
    ['cat', 'Bonnie'],
    ['cat', 'Blanco'],
    ['pony', 'Tiki']
  ];

  runner(script, data, {}).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok(report.codes[201] > 0, 'There should be 201s in the test');
      t.equal(
        report.codes[200],
        report.codes[201],
        'There should be a 200 for every 201'
      );
      t.ok(target.isDone(), 'Should have made a request to all the endpoints');

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});

test('Capture - XML', (t) => {
  if (!xmlCapture) {
    console.log(
      'artillery-xml-capture does not seem to be installed, skipping XML capture test.'
    );
    t.ok(true);
    return t.end();
  }

  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 2, arrivalRate: 5 }],
      payload: {
        fields: ['species', 'name']
      }
    },
    scenarios: [
      {
        name: 'Test XML capture',
        flow: [
          {
            get: {
              url: '/journeys',
              capture: {
                xpath: '(//Journey)[1]/JourneyId/text()',
                as: 'JourneyId'
              }
            }
          },
          {
            get: {
              url: '/journey/{{ JourneyId }}'
            }
          }
        ]
      }
    ]
  };

  const target = nock(script.config.target)
    .get('/journeys')
    .reply(
      200,
      `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tns1="http://" xmlns:tns="http://">
  <soap:Header></soap:Header>
  <soap:Body>
    <tns1:GetJourneys xmlns:tns1="http://">
        <Journey>
            <JourneyId>1</JourneyId>
            <JourneyFromCode>781</JourneyFromCode>
            <JourneyToCode>871</JourneyToCode>
        </Journey>
        <Journey>
            <JourneyId>2</JourneyId>
            <JourneyFromCode>781</JourneyFromCode>
            <JourneyToCode>915</JourneyToCode>
        </Journey>
        <Journey>
            <JourneyId>3</JourneyId>
            <JourneyFromCode>781</JourneyFromCode>
            <JourneyToCode>641</JourneyToCode>
        </Journey>
    </tns1:GetJourneys>
  </soap:Body>
</soap:Envelope>`,
      { 'content-type': 'application/xml' }
    )
    .get(/journey\/[^\/]+$/)
    .reply(function (uri) {
      if (uri.endsWith('/1')) {
        return [
          200,
          `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tns1="http://" xmlns:tns="http://">
  <soap:Header></soap:Header>
  <soap:Body>
    <tns1:GetJourney xmlns:tns1="http://">
        <Journey>
            <JourneyId>1</JourneyId>
            <JourneyFromCode>781</JourneyFromCode>
            <JourneyToCode>871</JourneyToCode>
            <JourneyAvailability>5</JourneyAvailability>
            <JourneyPrice>199</JourneyPrice>
        </Journey>
    </tns1:GetJourney>
  </soap:Body>
</soap:Envelope>`,
          { 'content-type': 'application/xml' }
        ];
      }

      return [404];
    });

  const data = [
    ['dog', 'Leo'],
    ['dog', 'Figo'],
    ['dog', 'Mali'],
    ['cat', 'Chewbacca'],
    ['cat', 'Puss'],
    ['cat', 'Bonnie'],
    ['cat', 'Blanco'],
    ['pony', 'Tiki']
  ];

  runner(script, data, {}).then(function (ee) {
    ee.on('done', function (nr) {
      const report = SSMS.legacyReport(nr).report();

      t.ok(target.isDone(), 'Should have made a request to all the endpoints');
      t.ok(report.codes[200] > 0, 'Should have a few 200s');
      t.ok(report.codes[404] === undefined, 'Should have no 404s');

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});

test('Capture - Random value from array', (t) => {
  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 2, arrivalRate: 5 }],
      ensure: {
        p95: 300
      }
    },
    scenarios: [
      {
        name: 'Get a random device and update its state.',
        flow: [
          {
            get: {
              url: '/devices',
              capture: {
                json: "$..[?(@parentProperty !== 'location' && @parentProperty !== 'group' && @property === 'id')]",
                as: 'id'
              }
            },
            put: {
              url: '/devices/{{ id }}',
              json: { power: true }
            }
          }
        ]
      }
    ]
  };

  const target = nock(script.config.target)
    .persist()
    .get('/devices')
    .reply(
      200,
      [
        {
          id: '4dcb754442b1285785b81833c77f4a46',
          label: 'Lamp 1',
          power: true,
          group: {
            id: '1c8de82b81f445e7cfaafae49b259c71',
            name: 'Room'
          },
          location: {
            id: '1d6fe8ef0fde4c6d77b0012dc736662c',
            name: 'Home'
          }
        },
        {
          id: 'e87c45241a484a3db9730ae4b98678d4',
          label: 'Lamp 2',
          power: false,
          group: {
            id: '1c8de82b81f445e7cfaafae49b259c71',
            name: 'Room'
          },
          location: {
            id: '1d6fe8ef0fde4c6d77b0012dc736662c',
            name: 'Home'
          }
        }
      ],
      { 'content-type': 'application/json' }
    )
    .put(/devices\/[^\/]+$/)
    .reply(function (uri) {
      if (
        uri.endsWith('e87c45241a484a3db9730ae4b98678d4') ||
        uri.endsWith('4dcb754442b1285785b81833c77f4a46')
      ) {
        return [200, { status: 'ok' }, { 'content-type': 'application/xml' }];
      }

      return [404];
    });

  runner(script).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      //t.ok(target.isDone(), 'Should have made a request to all the endpoints');
      t.ok(report.codes[200] > 0, 'Should have a few 200s');
      t.ok(report.codes[404] === undefined, 'Should have no 404s');

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});

test('Capture - RegExp', (t) => {
  const db = {};
  const script = {
    config: {
      target: 'http://127.0.0.1:3003',
      phases: [{ duration: 2, arrivalRate: 5 }],
      payload: {
        fields: ['species', 'name']
      }
    },
    scenarios: [
      {
        name: "Create a pet and verify it's been created (JSON).",
        flow: [
          {
            post: {
              url: '/pets',
              json: { name: '{{ name }}', species: '{{ species }}' },
              capture: {
                regexp: '[a-f0-9-]+-[a-f0-9]+',
                as: 'id'
              }
            }
          },
          {
            get: {
              url: '/pets/{{ id }}'
            }
          }
        ]
      }
    ]
  };

  const data = [
    ['dog', 'Leo'],
    ['dog', 'Figo'],
    ['dog', 'Mali'],
    ['cat', 'Chewbacca'],
    ['cat', 'Puss'],
    ['cat', 'Bonnie'],
    ['cat', 'Blanco'],
    ['pony', 'Tiki']
  ];

  let id;
  const target = nock(script.config.target)
    .persist()
    .post('/pets', function (body) {
      id = uuid.v4();
      db[id] = {
        ...body,
        id
      };

      return true;
    })
    .reply(201, function () {
      return { id };
    })
    .get(/pets\/[^\/]+$/)
    .reply(200);

  runner(script, data, {}).then(function (ee) {
    ee.on('done', (nr) => {
      const report = SSMS.legacyReport(nr).report();

      t.ok(report.codes[201] > 0, 'There should be 201s in the test');
      t.equal(
        report.codes[200],
        report.codes[201],
        'There should be a 200 for every 201'
      );
      t.ok(target.isDone(), 'Should have made a request to all the endpoints');

      ee.stop().then(() => {
        t.end();
      });
    });

    ee.run();
  });
});
