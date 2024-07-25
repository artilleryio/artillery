const http = require('http');
const port = process.env.TEST_PORT || 4444;

// Array that will keep growing, causing a memory leak
let leakyArray = [];

const server = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    const longString = new Array(1000000).join('x');
    leakyArray.push(longString);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Hello, this is a simple Node.js server!');
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  console.log(`Process PID is ${process.pid}`);
});
