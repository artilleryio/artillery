function myBeforeRequestHandler(req, res, context, ee, next) {
  //Change your function name and add your logic here.
  //For more information, check: https://docs.art/http-reference#function-signatures
  console.log(`Environment is ${context.vars.targetEnv}`);
  console.log(`Header is ${req.headers['x-fake-header']}`);
  next();
}

module.exports = {
  myBeforeRequestHandler
};
