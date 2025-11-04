const soap = require('soap');

let client;
const setupSoapClientIfNeeded = async (context) => {
  const url = `${context.vars.target}/wsdl?wsdl`;

  //caches client to avoid creating a new one for each VU
  if (!client) {
    client = await soap.createClientAsync(url);
  }
};

const callSoapOperation = async (operationName, events) => {
  const args = { number1: 5, number2: 3 };
  events.emit('counter', `soap.${operationName}.requests`, 1);
  const timeBefore = Date.now();
  await client[`${operationName}Async`](args);
  const timeTaken = Date.now() - timeBefore;
  events.emit('counter', `soap.${operationName}.responses`, 1);
  events.emit('histogram', `soap.${operationName}.response_time`, timeTaken);
};

module.exports = {
  sendSOAPRequest: async (context, events, done) => {
    try {
      await setupSoapClientIfNeeded(context);

      await callSoapOperation('addNumbers', events);

      done();
    } catch (err) {
      console.error('SOAP Request Error:', err);
      done(err);
    }
  }
};
