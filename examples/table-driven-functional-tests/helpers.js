const parse = require('csv-parse');
const fs = require('fs');
const path = require('path');

module.exports = {
  loadRequestData
};

function loadRequestData(vuContext, events, next) {
  const data = fs.readFileSync(path.join(__dirname, 'request-response.csv'), 'utf8');
  const result = [];
  parse(data, (err, output) => {
    // If the file can't be parsed, print the error and return
    // the error to the virtual user
    if(err) {
      artillery.log(err, 'error');
      return next(err);
    }

    // If parsing is successful, we'll map individual fields in the CSV
    // file to fields in our "result" object, which we will turn into
    // a variable for the VU
    for(const row of output) {
      result.push({
        url: row[0], // first field in our CSV is the URL
        code: row[1] // second field is the expected response code
      });
    }

    // Set the variable and return control back to the VU
    vuContext.vars['data'] = result;
    return next(null);
  });
}
