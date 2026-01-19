const data = [];

console.log('NODE_OPTIONS:');
console.log(process.env.NODE_OPTIONS);

function hogSomeRam(_req, _context, _events, next) {
  // Allocate 100MB
  data.push(Buffer.alloc(1024 * 1024 * 100, 1));

  console.log(new Date(), 'allocated more data');
  console.log('RSS (MB):', process.memoryUsage().rss / 1024 / 1024);

  return next();
}

module.exports = {
  hogSomeRam
};
