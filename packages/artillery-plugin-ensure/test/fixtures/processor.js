function runFibonacci(_req, _context, ee, next) {
  function fibonacci(num) {
    if (num === 1) return 0;
    if (num === 2) return 1;
    return fibonacci(num - 1) + fibonacci(num - 2);
  }
  const time = Date.now();
  fibonacci(35);
  const difference = Date.now() - time;
  ee.emit(
    'histogram',
    'browser.page.FCP.https://www.artillery.io/13eba89r?a>;02-',
    difference
  );
  next();
}

module.exports = {
  runFibonacci
};
