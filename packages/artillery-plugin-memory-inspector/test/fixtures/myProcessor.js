function myBeforeScenarioHandler(context, _ee, next) {
  console.log(`Hello from the Handler! URL: ${context.vars.target}!`);
  next();
}

module.exports = {
  myBeforeScenarioHandler
};
