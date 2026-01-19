function logOutput(_req, _res, _userContext, events, done) {
  for (let i = 0; i < 10; i++) {
    events.emit(
      'counter',
      `very.very.long.name.for.a.counter.metric.so.that.we.generate.a.lot.of.console.output.${Date.now()}${i}`,
      1
    );
    events.emit(
      'histogram',
      `very.very.long.name.for.a.histogram.metric.so.that.we.generate.a.lot.of.console.output.${Date.now()}${i}`,
      100
    );
  }
  return done();
}

module.exports = {
  logOutput
};
