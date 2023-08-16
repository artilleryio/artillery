import * as fs from 'node:fs';
import * as path from 'node:path';
import * as tap from 'tap';
import { validateTestScript } from './helpers';

const EXAMPLES_DIR = path.resolve(__dirname, '../../..', 'examples');

function fromExample(exampleAndTestScriptPath: string) {
  return (tap: Tap.Test) => {
    const testScriptPath = path.join(EXAMPLES_DIR, exampleAndTestScriptPath);
    const testScript = fs.readFileSync(testScriptPath, 'utf8');
    tap.same(validateTestScript(testScript), []);
    tap.end();
  };
}

tap.test('using-cookies', fromExample('using-cookies/cookies.yml'));

tap.test(
  'scenario-weights',
  fromExample('scenario-weights/scenario-weights.yml')
);

tap.test(
  'multiple-scenario-specs (common config)',
  fromExample('multiple-scenario-specs/common-config.yml')
);
tap.test(
  'multiple-scenario-specs (armadillo)',
  fromExample('multiple-scenario-specs/scenarios/armadillo.yml')
);
tap.test(
  'multiple-scenario-specs (dino)',
  fromExample('multiple-scenario-specs/scenarios/dino.yml')
);
tap.test(
  'multiple-scenario-specs (pony)',
  fromExample('multiple-scenario-specs/scenarios/pony.yml')
);
