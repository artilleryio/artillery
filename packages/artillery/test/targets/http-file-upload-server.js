const Hapi = require('@hapi/hapi');
const path = require('path');
const crypto = require('crypto');

const createTestServer = async (port) => {
  const server = Hapi.server({
    port: port || 0,
    host: '127.0.0.1'
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: (request, h) => {
      return {
        status: 'success',
        message: 'Hello!'
      };
    }
  });

  server.route({
    method: 'POST',
    path: '/upload',
    options: {
      payload: {
        maxBytes: 10485760, // 10 MB
        output: 'stream',
        parse: true,
        multipart: {
          output: 'stream'
        }
      }
    },
    handler: async (request, h) => {
      const data = request.payload;
      const files = [];
      const fields = {};

      for (const key in data) {
        if (!data[key].hapi || !data[key]._data) {
          // Handle non-file fields
          fields[key] = data[key];
          continue;
        }

        // Handle file fields
        const file = data[key];
        const filename = path.basename(file.hapi.filename);

        // calculate a hash of the file so it can be compared in tests
        const hash = crypto.createHash('sha256');
        await new Promise((resolve, reject) => {
          file.on('end', () => resolve());
          file.on('error', (err) => reject(err));
          file.on('data', (chunk) => {
            hash.update(chunk);
          });
        });

        files.push({
          fieldName: key,
          originalFilename: filename,
          fileHash: hash.digest('hex'),
          headers: file.hapi.headers
        });
      }

      return {
        status: 'success',
        message: 'Files and fields uploaded successfully',
        files,
        fields
      };
    }
  });

  await server.start();
  console.log(`File upload server listening on ${server.info.uri}`);
  return server;
};

module.exports = {
  createTestServer
};
