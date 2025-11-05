

const Hapi = require('@hapi/hapi');

const main = async () => {
  const server = Hapi.server({ port: 3004, host: '127.0.0.1' });
  server.route({
    path: '/api/v1/register',
    method: 'POST',
    handler: register
  });
  await server.start();
  return server;
};

main()
  .then((server) => console.log(`Listening on ${server.info.uri}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function register(_req, _h) {
  return { status: 'success' };
}
