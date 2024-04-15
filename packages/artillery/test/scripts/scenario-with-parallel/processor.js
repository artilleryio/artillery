function beforeReqInParallel(req, context, ee, next) {
  ee.emit('counter', `beforeRequestHook.${req.name}`, 1);
  context.vars[req.name] = req.uuid;
  next();
}

function afterReqInParallel(req, res, context, ee, next) {
  ee.emit('counter', `afterRequestHook.${req.name}`, 1);
  console.log(`${req.name}=${context.vars[req.name] === req.uuid}`);
  next();
}

module.exports = {
  beforeReqInParallel,
  afterReqInParallel
};
