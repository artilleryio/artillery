/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */



const Hapi = require('@hapi/hapi');

module.exports = {
  createCalcServer
};

function createServer(host, port) {
  const server = Hapi.server({ port: port, host: host });
  server.listener.keepAliveTimeout = 120e3;
  return server;
}

function createCalcServer(host, port) {
  const newServer = createServer(host, port);

  newServer.route([
    {
      method: 'POST',
      path: '/double',
      handler: double
    },
    {
      method: 'POST',
      path: '/inc',
      handler: inc
    }
  ]);

  return newServer;
}

/**
 * Doubles a number.
 *
 * Example: curl -sv -X POST localhost:52628/double --data 'number=5'
 *
 */
function double(req, h) {
  if (!req.payload || !req.payload.number) {
    return h.response().code(400);
  }

  const number = Number(req.payload.number);

  if (Number.isNaN(number)) {
    return h.response().code(400);
  }

  return h.response({ result: number * 2 }).code(200);
}

/**
 * Increments a number.
 *
 * Example: curl -sv -X POST localhost:52628/double --data 'number=1'
 *
 */
function inc(req, h) {
  if (!req.payload || !req.payload.number) {
    return h.response().code(400);
  }

  const number = Number(req.payload.number);

  if (Number.isNaN(number)) {
    return h.response().code(400);
  }

  return h.response({ result: number + 1 }).code(200);
}
