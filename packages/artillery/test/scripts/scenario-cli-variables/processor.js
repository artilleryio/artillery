function myAfterResponseHandler(req, res, context, ee, next) {
  //These are being console.logged so they can be asserted on by the test framework on the output
  console.log(`HTTP timeout is: ${req.timeout}`);
  console.log(
    `Has default cookie: ${JSON.stringify(context._jar.store).includes(
      'abc123'
    )}`
  );
  console.log(
    `Has cookie from flow: ${JSON.stringify(context._jar.store).includes(
      'hellothere'
    )}`
  );
  next();
}

module.exports = {
  myAfterResponseHandler
};
