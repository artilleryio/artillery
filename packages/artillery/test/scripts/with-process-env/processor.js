function myBeforeRequestHandler(req, res, context, ee, next) {
  console.log(`Environment is ${context.vars.targetEnv}`);
  console.log(`Header is ${req.headers['x-fake-header']}`);
  next();
}

module.exports = {
  myBeforeRequestHandler
};
