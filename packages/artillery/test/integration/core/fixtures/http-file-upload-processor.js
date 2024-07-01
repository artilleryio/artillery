'use strict';

function getResponse(req, res, context, ee, next) {
  // We log the response body here so we can access it from the output
  console.log('RESPONSE BODY: ', res.body, ' RESPONSE BODY END');
  next();
}

module.exports = {
  getResponse
};
