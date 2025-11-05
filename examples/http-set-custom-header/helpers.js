const https = require('node:https');

// Set the value of a header to a custom value, which
// in this example comes from an HTTP call to another
// API
function setCustomHeader(req, _userContext, _ee, next) {
  let data = '';

  https
    .get('https://api.artillery.io/v1/dino', (res) => {
      res.on('data', (d) => {
        data += d;
      });

      res.on('end', () => {
        // Extract a string composed of letters + spaces + punctuation:
        const val = data.match(/^<([A-Za-z!\s]+)/m)[1].trim();
        // Use that as the value of our custom header:
        req.headers['x-dino'] = val;
        return next();
      });
    })
    .on('error', (e) => {
      return next(e);
    });
}

module.exports = {
  setCustomHeader
};
