const path = require("path");
const core = require("@actions/core");
const { exec } = require("@actions/exec");

function getInputs() {
  const test = core.getInput("test");
  const target = core.getInput("target");
  const output = core.getInput("output");
  const config = core.getInput("config");

  return {
    test,
    target,
    output,
    config,
  };
}

const ARTILLERY_BINARY_PATH = "/home/node/artillery/bin/run";

function inputsToFlags(inputs) {
  const flags = [];

  for (const optionName in inputs) {
    flags.push(`--${optionName}=${inputs[optionName]}`);
  }

  return flags;
}

async function main() {
  core.debug(`running Artillery binary at "${ARTILLERY_BINARY_PATH}"...`);

  const { test, ...options } = getInputs();
  const flags = inputsToFlags(options);

  core.info(`flags: ${JSON.stringify(flags, null, 2)}`);

  await exec(ARTILLERY_BINARY_PATH, ["run", test, ...flags], {
    stdio: "inherit",
  }).catch((error) => {
    core.setFailed(error.message);
  });
}

main();
