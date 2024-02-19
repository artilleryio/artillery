module.exports = {
  attachScenarioHooks,
  versionCheck,
  sleep
};

const semver = require('semver');

async function sleep(n) {
  return new Promise((resolve, _reject) => {
    setTimeout(function () {
      resolve();
    }, n);
  });
}

// TODO: Extract into a utility function in Artillery itself
function versionCheck(range) {
  if (!global.artillery || !global.artillery.version) {
    return false;
  } else {
    return semver.satisfies(semver.coerce(global.artillery.version), range);
  }
}

function attachScenarioHooks(script, specs) {
  const scenarios = script.scenarios;

  if (typeof scenarios !== 'object' || scenarios.length < 1) {
    return;
  }

  scenarios.forEach((scenario) => {
    specs.forEach((spec) => {
      // console.log(spec.engine, scenario.engine);
      // if (spec.engine && spec.engine !== scenario.engine) {
      //   return;
      // }

      scenario[spec.type] = [].concat(scenario[spec.type] || []);
      scenario[spec.type].push(spec.name);
      addHelperFunction(script, spec.name, spec.hook);
    });
  });
}

function addHelperFunction(script, name, func) {
  if (!script.config.processor) {
    script.config.processor = {};
  }

  script.config.processor[name] = func;
}
