import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tap from 'tap';
import { validateTestScript } from './helpers';

const ROOT_DIR = path.resolve(__dirname, '../../..');

function fromExample(testScriptPath: string) {
  return (tap: Tap.Test) => {
    const absoluteTestScriptPath = path.join(ROOT_DIR, testScriptPath);
    const testScript = fs.readFileSync(absoluteTestScriptPath, 'utf8');
    tap.same(validateTestScript(testScript), []);
    tap.end();
  };
}

const exampleTestScripts = [
  'examples/artillery-engine-example/example.yaml',
  'examples/artillery-plugin-hello-world/test.yml',
  'examples/automated-checks/load-test-with-automated-checks.yml',
  'examples/browser-load-testing-playwright/browser-load-test.yml',
  'examples/browser-load-testing-playwright/browser-smoke-test.yml',
  'examples/browser-load-testing-playwright/browser-test-with-steps.yml',
  'examples/cicd/aws-codebuild/tests/performance/socket-io.yml',
  'examples/cicd/github-actions/.github/workflows/load-test.yml',
  'examples/http-file-uploads/file-uploads.yml',
  'examples/functional-testing-with-expect-plugin/functional-load-tests.yml',
  'examples/generating-vu-tokens/auth-with-token.yml',
  'examples/graphql-api-server/graphql.yaml',
  'examples/http-metrics-by-endpoint/endpoint-metrics.yml',
  'examples/http-set-custom-header/set-header.yml',
  'examples/http-socketio-server/http-socket.yml',
  'examples/multiple-scenario-specs/common-config.yml',
  'examples/multiple-scenario-specs/scenarios/armadillo.yml',
  'examples/multiple-scenario-specs/scenarios/dino.yml',
  'examples/multiple-scenario-specs/scenarios/pony.yml',
  'examples/scenario-weights/scenario-weights.yml',
  'examples/script-overrides/test.yaml',
  'examples/socket-io/socket-io.yml',
  'examples/starter-kit/scenarios/sample_task_01.yaml',
  'examples/starter-kit/scenarios/sample_task_02.yaml',
  'examples/starter-kit/scenarios/sample_task_03.yaml',
  'examples/table-driven-functional-tests/functional-test.yml',
  'examples/track-custom-metrics/custom-metrics.yml',
  'examples/using-cookies/cookies.yml',
  'examples/using-data-from-csv/website-test.yml',
  'examples/websockets/test.yml'
];

exampleTestScripts.forEach((testScriptPath) => {
  tap.test(testScriptPath, fromExample(testScriptPath));
});
