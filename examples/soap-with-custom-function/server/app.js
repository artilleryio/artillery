const soap = require('soap');
const express = require('express');
const bodyParser = require('body-parser');

const service = {
  AddNumbersService: {
    AddNumbersPort: {
      addNumbers: (args) => {
        console.log('RECEIVED REQUEST', args);
        return { sum: Number(args.number1) + Number(args.number2) };
      }
    }
  }
};

const xml = require('node:fs').readFileSync('MyService.wsdl', 'utf8');

const app = express();
app.use(
  bodyParser.raw({
    type: () => true,
    limit: '5mb'
  })
);
app.listen(8000, () => {
  soap.listen(app, '/wsdl', service, xml);
  console.log('Server running on port 8000');
});
