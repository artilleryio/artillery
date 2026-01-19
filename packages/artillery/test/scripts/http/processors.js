

function simpleFunction(_context, ee, next) {
  ee.emit('counter', 'simpleFunction', 1);
  next();
}

let executionOrder = 1;

async function asyncFunction(_context, ee, next) {
  await new Promise((resolve) => {
    setTimeout(() => {
      ee.emit('counter', 'asyncFunctionOrder', executionOrder++);
      resolve();
    }, 1000);
  });

  next();
}

function otherFunction(_context, ee, next) {
  ee.emit('counter', 'otherFunctionOrder', executionOrder++);
  next();
}

function errorCodeFunction(_context, _ee, next) {
  next({ code: 123 });
}

function errorMessageFunction(_context, _ee, next) {
  next({ message: 'AwesomeErrorMessage' });
}

module.exports = {
  simpleFunction,
  asyncFunction,
  otherFunction,
  errorCodeFunction,
  errorMessageFunction
};
