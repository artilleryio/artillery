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

const ARTILLERY_TAG = "v2.0.0-34";

function getDownloadUrl(tag) {
  return `https://github.com/artilleryio/artillery/archive/refs/tags/${tag}.tar.gz`;
}

async function main() {
  const { test, ...options } = getInputs();

  // Download the CLI tarball.
  const downloadUrl = getDownloadUrl(ARTILLERY_TAG);
  core.info({ downloadTool });

  const tarballPath = await toolCache.downloadTool(downloadUrl);
  core.info({ tarballPath });

  const cliPath = await toolCache.extractTar(tarballPath);

  core.info({ cliPath });

  // Run the CLI.
  await exec(cliPath, [test], {
    stdio: "inherit",
  }).catch((error) => {
    core.setFailed(error.message);
  });
}

main();
