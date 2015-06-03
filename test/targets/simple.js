var Hapi = require('hapi');

var PORT = 3003;

var server = new Hapi.Server();
server.connection({
  host: '0.0.0.0',
  port: PORT
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
  method: 'POST',
  path: '/pets/:id',
  handler: show
});
server.route({
  method: 'GET',
  path: '/_stats',
  handler: stats
});

server.start(function() {
  console.log('Target listening on 0.0.0.0:' + PORT);
});

var REQUEST_COUNT = 0; // fixme

function index(req, reply) {
  REQUEST_COUNT++;
  return reply('ok');
}

function create(req, reply) {
  REQUEST_COUNT++;
  return reply('ok').code(201);
}

function show(req, reply) {
  REQUEST_COUNT++;
  return reply({name: 'Manny', species: 'dog'});
}

function stats(req, reply) {
  return reply(REQUEST_COUNT);
}
