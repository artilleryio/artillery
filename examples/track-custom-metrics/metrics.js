module.exports = { trackPets };

function trackPets(req, res, context, events, done) {
  // After every response, increment the 'Pets created' counter by 1.
  events.emit("counter", "Pets created", 1);

  // Parse the 'server-timing' header and look for the 'pets' metric,
  // and add it to 'Pet creation latency' histogram.
  const latency = parseServerTimingLatency(res.headers["server-timing"], "pets");
  events.emit("histogram", "Pet creation latency", latency);

  return done();
}

function parseServerTimingLatency(header, timingMetricName) {
  const serverTimings = header.split(",");

  for (let timing of serverTimings) {
    const timingDetails = timing.split(";");
    if (timingDetails[0] === timingMetricName) {
      return parseFloat(timingDetails[1].split("=")[1]);
    }
  }
}
