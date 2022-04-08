const sinon = require('sinon');

module.exports = {
  beforeHookBeforeRequest: sinon.stub().callsArg(3),
  afterHookBeforeRequest: sinon.stub().callsArg(3)
};
