/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */



const create = require('./targetServer').createCalcServer;

const main = async () => {
  const server = create('127.0.0.1', process.env.PORT);
  await server.start();
  return server;
};

main()
  .then((server) => console.log(`Server listening on ${server.info.uri}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
