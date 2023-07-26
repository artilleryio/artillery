function myBeforeScenarioHandler(context, ee, next) {
  console.log('Hello from the Handler!');
  next();
}

module.exports = {
  myBeforeScenarioHandler
};
