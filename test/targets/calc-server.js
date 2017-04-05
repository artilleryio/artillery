/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const create = require('./targetServer').createCalcServer;
const server = create('127.0.0.1', process.env.PORT);

server.start().then(function() {
  console.log('server listening on:', server.info.uri);
});
