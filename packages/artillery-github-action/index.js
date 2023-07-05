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

const ARTILLERY_CLI_PATH = "/home/node/artillery/bin/run";

async function main() {
  const { test, ...options } = getInputs();

  await exec(ARTILLERY_CLI_PATH, ["run", test], {
    stdio: "inherit",
  }).catch((error) => {
    core.setFailed(error.message);
  });
}

main();
