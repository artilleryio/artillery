const Hapi = require('@hapi/hapi');
const uuid = require('uuid');

let REQUEST_COUNT = 0;
const COOKIES = {};

const users = {
  leo: {
    name: 'leo',
    password: 'secret',
    id: '1'
  }
};

const LARGE_RESPONSE = JSON.stringify({
  data: new Array(1024 * 1024 * 10).join('0')
});

const validate = async (_request, username, password, _h) => {
  const user = users[username];
  if (!user) {
    return { credentials: null, isValid: false };
  }

  const isValid = password === user.password;
  const credentials = { id: user.id, name: user.name };
  return { isValid, credentials };
};

const createTestServer = async (port) => {
  const server = Hapi.server({ port });
  await server.register(require('@hapi/basic'));
  server.auth.strategy('simple', 'basic', { validate });
  // server.auth.default('simple');

  //
  // routes
  //
  server.route({
    method: 'GET',
    path: '/protected',
    config: {
      auth: 'simple',
      handler: (req, _h) =>
        `secret timestamp for ${req.auth.credentials.name}: ${Date.now()}`
    }
  });

  route(server);

  server.state('testCookie', {
    ttl: null,
    isSecure: false,
    isHttpOnly: true,
    encoding: 'base64json',
    clearInvalid: false,
    strictHeader: true
  });

  await server.start();
  return server;
};

// TODO: clean up

function route(server) {
  server.route({
    method: 'GET',
    path: '/largeResponse',
    handler: function largeResponse(_req, _h) {
      return LARGE_RESPONSE;
    }
  });

  server.route({
    method: 'POST',
    path: '/setscookie',
    handler: setsCookie
  });

  server.route({
    method: 'GET',
    path: '/expectscookie',
    handler: expectsCookie,
    config: {
      state: {
        parse: true,
        failAction: 'log'
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/pets',
    handler: index
  });
  server.route({
    method: 'POST',
    path: '/pets',
    handler: create
  });
  server.route({
    method: 'GET',
    path: '/pets/{id}',
    handler: read
  });
  server.route({
    method: 'GET',
    path: '/_stats',
    handler: stats
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: index
  });

  server.route({
    method: 'POST',
    path: '/',
    handler: postIndex,
    options: {
      payload: {
        maxBytes: 100 * 1024 * 1024
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/header',
    handler: (_request, h) => h.response().header('x-auth', 'secret')
  });

  server.route({
    method: 'GET',
    path: '/expectsHeader',
    handler: (request, h) => {
      if (request.headers['x-auth'] && request.headers['x-auth'] === 'secret') {
        return { success: true };
      } else {
        return h.response().code(403);
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/journeys',
    handler: getJourneys
  });

  server.route({
    method: 'GET',
    path: '/journey/{id}',
    handler: getJourney
  });

  server.route({
    method: 'GET',
    path: '/devices',
    handler: getDevices
  });

  server.route({
    method: 'PUT',
    path: '/devices/{id}',
    handler: putDevice
  });

  //
  // Used by loop_range.json test
  //
  server.route([
    {
      method: 'GET',
      path: '/loop/9',
      handler: ok
    },
    {
      method: 'GET',
      path: '/loop/10',
      handler: ok
    },
    {
      method: 'GET',
      path: '/loop/11',
      handler: ok
    }
  ]);

  server.route([
    {
      method: 'GET',
      path: '/malformed_cookie',
      handler: (_request, h) =>
        h.response().header('Set-Cookie', 'malformed').code(200)
    }
  ]);
}

function ok(_req, _h) {
  return 'ok';
}

const DB = {};

const _reporters = [];

function index(_req, _h) {
  return 'ok';
}

function postIndex(_req, h) {
  return h.response('ok').code(200);
}

function create(req, h) {
  const id = uuid.v4();
  DB[id] = req.payload;
  DB[id].id = id;
  REQUEST_COUNT++;
  return h.response({ id: id }).code(201);
}

function read(req, h) {
  REQUEST_COUNT++;
  const result = DB[req.params.id];
  if (result) {
    return h.response(result).code(200);
  } else {
    return h.response().code(404);
  }
}

function stats(_req, _h) {
  return {
    requestCount: REQUEST_COUNT,
    cookies: COOKIES
  };
}

//
// curl -v -X POST 0.0.0.0:3003/setscookie
// curl -v 0.0.0.0:3003/expectscookie -b 'testCookie=eyJ1aWQiOiIxNWMwMjNkMC02YmMxLTRkODEtYmQ1OS0wNjRmYjhmMGU0YTkifQ==;'
//

function setsCookie(_req, h) {
  const newuid = uuid.v4();
  // console.log('setting testCookie.uid to %j', newuid);
  h.state('testCookie', { uid: newuid });
  return h.continue;
}

function expectsCookie(req, h) {
  console.log('req.state = %j', req.state);
  //console.log('req.state.testCookie = %j', req.state.testCookie);
  if (req.state.testCookie) {
    if (COOKIES[req.state.testCookie.uid]) {
      COOKIES[req.state.testCookie.uid]++;
    } else {
      COOKIES[req.state.testCookie.uid] = 1;
    }
    return 'ok';
  } else {
    return h.response().code(403);
  }
}

function getJourneys(_req, h) {
  const response = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tns1="http://" xmlns:tns="http://">
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
</soap:Envelope>`;
  return h.response(response).type('application/xml');
}

function getJourney(req, h) {
  console.log(req.params.id);
  if (req.params.id === '1') {
    const response = `
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"  xmlns:tns1="http://" xmlns:tns="http://">
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
</soap:Envelope>`;
    return h.response(response).type('application/xml');
  }

  return h.response('').code(404);
}

function getDevices(_req, h) {
  const response = `
[
  {
    "id": "4dcb754442b1285785b81833c77f4a46",
    "label": "Lamp 1",
    "power": true,
    "group": {
      "id": "1c8de82b81f445e7cfaafae49b259c71",
      "name": "Room"
    },
    "location": {
      "id": "1d6fe8ef0fde4c6d77b0012dc736662c",
      "name": "Home"
    }
  },
  {
    "id": "e87c45241a484a3db9730ae4b98678d4",
    "label": "Lamp 2",
    "power": false,
    "group": {
      "id": "1c8de82b81f445e7cfaafae49b259c71",
      "name": "Room"
    },
    "location": {
      "id": "1d6fe8ef0fde4c6d77b0012dc736662c",
      "name": "Home"
    }
  }
]
`;
  return h.response(response).type('application/json').code(200);
}

function putDevice(req, h) {
  if (
    req.params.id === '4dcb754442b1285785b81833c77f4a46' ||
    req.params.id === 'e87c45241a484a3db9730ae4b98678d4'
  ) {
    return h.response('{"status": "ok"}').type('application/json').code(200);
  } else {
    return h.response('').code(404);
  }
}

module.exports = createTestServer;
