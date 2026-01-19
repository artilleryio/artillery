module.exports = { maybeSleep, emitCsvCounters };

function maybeSleep(_req, _context, _events, done) {
  if (Math.random() < 0.7) {
    return done();
  }

  setTimeout(() => {
    return done();
  }, Math.random() * 1000);
}

function emitCsvCounters(context, events, done) {
  if (context.vars.number) {
    events.emit('counter', `csv_number_${context.vars.number}`, 1);
  }

  if (context.vars.name) {
    events.emit('counter', `csv_name_${context.vars.name}`, 1);
  }

  return done();
}
