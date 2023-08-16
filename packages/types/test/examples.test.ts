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

tap.skip(
  'scenario-weights',
  fromExample('scenario-weights/scenario-weights.yml')
);
