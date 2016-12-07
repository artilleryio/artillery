'use strict';

const Hapi = require('hapi');

const server = new Hapi.Server();
server.connection({host: 'localhost', port: 3004});
server.route([{
  path: '/api/v1/register',
  method: 'POST',
  handler: register
}]);

server.start(function(err) {
  if (err) {
    console.log(err);
    process.exit(-1);
  }
  console.log('listening on 3004');
});

function register(req, reply) {
  setTimeout(function() {
    reply({status: 'success'});
  }, Math.floor(Math.random() * 50));
}
