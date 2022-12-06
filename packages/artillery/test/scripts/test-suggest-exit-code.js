module.exports = {
  setNonZeroCode
};

function setNonZeroCode(req, res, vuContext, events, next) {
  artillery.suggestedExitCode = 17;
  return next();
}
