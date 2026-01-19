module.exports = { trackPets };

function trackPets(_req, res, _context, events, done) {
  // After every response, increment the 'pets_created' counter by 1.
  events.emit('counter', 'pets_created', 1);

  // Parse the 'server-timing' header and look for the 'pets' metric,
  // and add it to 'pet_creation_latency' histogram.
  const latency = parseServerTimingLatency(
    res.headers['server-timing'],
    'pets'
  );
  events.emit('histogram', 'pet_creation_latency', latency);

  return done();
}

function parseServerTimingLatency(header, timingMetricName) {
  const serverTimings = header.split(',');

  for (const timing of serverTimings) {
    const timingDetails = timing.split(';');
    if (timingDetails[0] === timingMetricName) {
      return parseFloat(timingDetails[1].split('=')[1]);
    }
  }
}
