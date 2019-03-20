const fs = require('fs');
const run = require('../..').run;
const rawScript = {
  config: {
    target: 'http://127.0.0.1:3003',
    phases: [
      { duration: 1, arrivalRate: 1 }
    ]
  },
  scenarios: [
    {
      flow: [
        {get: {url: '/'}}
      ]
    }
  ]
};
const scriptPath = './in-process-script.json';

const testCase = process.argv[2];

let script;
let output;
let checkOutput;
let testResult;

switch(testCase) {
  case 'in-process-script-input':
    script = rawScript;
    output = './in-process-results.json';
    checkOutput = () => {
      const results = fs.readFileSync(output);
      const resultObj = JSON.parse(results);

      fs.unlink(output); // Clean up output file

      return typeof resultObj === 'object' && resultObj.aggregate.scenariosCompleted === 1;
    };
    break;

  case 'in-process-results-callback':
    fs.writeFileSync(scriptPath, JSON.stringify(rawScript));
    script = scriptPath;
    output = (result) => { testResult = result; };
    checkOutput = () => {
      fs.unlink(scriptPath); // Clean up test script file
      return typeof testResult === 'object' && testResult.aggregate.scenariosCompleted === 1;
    };
    break;
}

// Since Artillery will call process.exit() upon termination,
// we patch it to load result and verify the results.
const exit = process.exit;

process.exit = (code) => {
  process.exit = exit; // Unpatch

  if (code === 0 && checkOutput()) {
    process.exit(0);
  } else {
    process.exit(1);
  }
};

run(script, {output});
