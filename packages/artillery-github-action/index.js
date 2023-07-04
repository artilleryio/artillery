const core = require("@actions/core");

function getInputs() {
  const tests = core.getInput("tests");
  const target = core.getInput("target");
  const output = core.getInput("output");
  const config = core.getInput("config");

  return {
    tests,
    target,
    output,
    config,
  };
}

async function main() {
  const { tests, ...options } = getInputs();

  core.info("hello from Artillery!");
}

main();
