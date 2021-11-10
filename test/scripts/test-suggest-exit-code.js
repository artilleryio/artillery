module.exports = {
  maybeSetNonZeroCode,
};

function maybeSetNonZeroCode(req, res, vuContext, events, next) {
  if (Math.random() > 0.1) {
    console.log('setting exit code to 17, thread id:', process.env.LOCAL_WORKER_ID);
    artillery.suggestedExitCode = 17;
  } else {
    console.log(process.env.LOCAL_WORKER_ID, 'leaving exit code as is');
  }
  return next();
};
