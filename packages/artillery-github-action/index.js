const fs = require("node:fs/promises");
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
    const optionValue = inputs[optionName];

    if (optionValue) {
      flags.push(`--${optionName}=${optionValue}`);
    }
  }

  return flags;
}

async function main() {
  core.debug(`running Artillery binary at "${ARTILLERY_BINARY_PATH}"...`);
  const { test, ...options } = getInputs();
  const flags = inputsToFlags(options);

  core.debug(`cli flags: ${JSON.stringify(flags, null, 2)}`);

  // Run the tests.
  await exec(ARTILLERY_BINARY_PATH, ["run", test, ...flags], {
    stdio: "inherit",
  }).catch((error) => {
    core.setFailed(error.message);
  });

  // Generate the HTML report.
  if (options.output) {
    const htmlReportFilename = `report.html`;
    await exec(ARTILLERY_BINARY_PATH, [
      "report",
      `-o=${htmlReportFilename}`,
      options.output,
    ]).catch((error) => {
      core.error("Generating HTML report failed!");
      core.error(error);
    });

    const htmlReportFilePath = path.resolve(process.cwd(), htmlReportFilename);

    const reportContent = await fs
      .readFile(htmlReportFilePath, "utf8")
      .catch((error) => {
        core.error("Reading the generated report HTML failed!");
        core.error(error);
      });

    core.summary.addRaw(reportContent, true);
    await core.summary.write();
  }
}

main();
