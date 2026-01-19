function myAfterResponseHandler(_req, _res, _context, _ee, next) {
  //Change your function name and add your logic here.
  //For more information, check: https://docs.art/http-reference#function-signatures
  console.log('After Response Handler still working');
  next();
}

module.exports = {
  myAfterResponseHandler
};
