module.exports = {
  setNonZeroCode
};

function setNonZeroCode(_req, _res, _vuContext, _events, next) {
  artillery.suggestedExitCode = 17;
  return next();
}
