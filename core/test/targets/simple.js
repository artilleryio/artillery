'use strict';

var Hapi = require('hapi');
var uuid = require('uuid');
var Bcrypt = require('bcrypt');
var Basic = require('hapi-auth-basic');

var PORT = 3003;

var REQUEST_COUNT = 0;
var COOKIES = {};

var server = new Hapi.Server({
  load: {sampleInterval: 1000}
});

server.connection({
  host: '0.0.0.0',
  port: PORT
});

var users = {
  leo: {
    name: 'leo',
    password: '$2a$10$iqJSHD.BGr0E2IxQwYgJmeP3NvhPrXAeLSaGCj6IR/XU5QtjVu5Tm',   // 'secret'
    id: '1'
  }
};

var validate = function(request, username, password, callback) {
  var user = users[username];
  if (!user) {
    return callback(null, false);
  }

  Bcrypt.compare(password, user.password, (err, isValid) => {
      callback(err, isValid, { id: user.id, name: user.name });
  });
};

// TODO: clean up

const LARGE_RESPONSE = JSON.stringify({
  data: new Array(1024 * 1024 * 10).join('0')
});

server.route({
  method: 'GET',
  path: '/largeResponse',
  handler: function largeResponse(req, reply) {
    return reply(LARGE_RESPONSE);
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
  handler: postIndex
});

server.route({
  method: 'GET',
  path: '/header',
  handler: function(request, reply) {
    return reply().header('x-auth', 'secret');
  }
});

server.route({
  method: 'GET',
  path: '/expectsHeader',
  handler: function(request, reply) {
    if (request.headers['x-auth'] && request.headers['x-auth'] === 'secret') {
      return reply({success: true}).code(200);
    } else {
      return reply().code(403);
    }
  }
});

server.route(
  {
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

function ok(req, reply) {
  reply('ok');
}

server.state('testCookie', {
  ttl: null,
  isSecure: false,
  isHttpOnly: true,
  encoding: 'base64json',
  clearInvalid: false,
  strictHeader: true
});

var DB = {};

let reporters = [];
if (!process.env.SILENT) {
  reporters.push({
    reporter: require('good-console'),
    events: {error: '*', log: '*', response: '*'}
  });
}

server.register([{
  register: require('good'),
  options: {
    opsInterval: 1000,
    reporters: reporters
  }
},
{
  register: Basic
}], function(err) {
  if (err) {
    console.error(err);
  } else {
    server.auth.strategy('simple', 'basic', { validateFunc: validate });

    server.route({
      method: 'GET',
      path: '/protected',
      config: {
        auth: 'simple',
        handler: function(request, reply) {
          console.log(request.auth);
          return reply('secret timestamp for ' + request.auth.credentials.name + ': ' + Date.now());
        }
      }
    });

    server.start(function() {
      console.log('Target listening on 0.0.0.0:' + PORT);

      setInterval(function() {
        console.log(new Date());
        console.log('REQUEST_COUNT = %s', REQUEST_COUNT);
      }, 20 * 1000);
    });
  }
});

function index(req, reply) {
  //req.log(['index']);
  setTimeout(function() {
    REQUEST_COUNT++;
    reply('ok');
  }, Math.floor(Math.random() * 100));
}

function postIndex(req, reply) {
  reply('ok');
}

function create(req, reply) {
  var id = uuid.v4();//.split('-')[0];
  DB[id] = req.payload;
  DB[id].id = id;
  REQUEST_COUNT++;
  return reply({id: id}).code(201);
}

function read(req, reply) {
  REQUEST_COUNT++;
  var result = DB[req.params.id];
  //console.log(typeof result);
  //console.log(result);
  if (result) {
    return reply(result).code(200);
  } else {
    return reply().code(404);
  }
}

function stats(req, reply) {
  return reply({
    requestCount: REQUEST_COUNT,
    cookies: COOKIES
  });
}

//
// curl -v -X POST 0.0.0.0:3003/setscookie
// curl -v 0.0.0.0:3003/expectscookie -b 'testCookie=eyJ1aWQiOiIxNWMwMjNkMC02YmMxLTRkODEtYmQ1OS0wNjRmYjhmMGU0YTkifQ==;'
//

function setsCookie(req, reply) {
  var newuid = uuid.v4();
  console.log('setting testCookie.uid to %j', newuid);
  reply('ok').state('testCookie', {uid: newuid});
}

function expectsCookie(req, reply) {
  console.log('req.state = %j', req.state);
  //console.log('req.state.testCookie = %j', req.state.testCookie);
  if (req.state.testCookie) {
    if (COOKIES[req.state.testCookie.uid]) {
      COOKIES[req.state.testCookie.uid]++;
    } else {
      COOKIES[req.state.testCookie.uid] = 1;
    }
    return reply('ok');
  } else {
    return reply().code(403);
  }
}

function getJourneys(req, reply) {
  var response = `
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
  return reply(response)
    .type('application/xml');
}

function getJourney(req, reply) {
  console.log(req.params.id);
  if (req.params.id === '1') {
    let response = `
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
    return reply(response).type('application/xml');
  }

  return reply('').code(404);
}

function getDevices(req, reply) {
  var response = `
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
  return reply(response)
    .type('application/json')
    .code(200);
}

function putDevice(req, reply) {
  if (req.params.id === "4dcb754442b1285785b81833c77f4a46" || req.params.id === "e87c45241a484a3db9730ae4b98678d4") {
    return reply('{"status": "ok"}')
      .type('application/json')
      .code(200);
  } else {
    return reply('')
      .code(404);
  }
}
