const path = require("path");
const core = require("@actions/core");
const toolCache = require("@actions/tool-cache");
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

const ARTILLERY_VERSION = "2.0.0-34";

function getDownloadUrl(version) {
  return `https://github.com/artilleryio/artillery/archive/refs/tags/v${version}.tar.gz`;
}

async function main() {
  const { test, ...options } = getInputs();

  // Download the CLI tarball.
  const downloadUrl = getDownloadUrl(ARTILLERY_VERSION);
  core.info(`downloadUrl: ${downloadUrl}`);

  const tarballPath = await toolCache.downloadTool(downloadUrl);
  core.info(`tarballPath: ${tarballPath}`);

  const cliPath = await toolCache.extractTar(tarballPath);
  const binaryPath = path.resolve(
    cliPath,
    `artillery-${ARTILLERY_VERSION}/packages/artillery/bin/run`
  );

  core.info(`cliPath: ${cliPath}`);
  core.info(`binaryPath: ${binaryPath}`);

  // Run the CLI.
  await exec(binaryPath, [test], {
    stdio: "inherit",
  }).catch((error) => {
    core.setFailed(error.message);
  });
}

main();
