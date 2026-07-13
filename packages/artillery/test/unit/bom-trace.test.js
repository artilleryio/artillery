const promisify = require('node:util').promisify;
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  createBOM,
  enrichPackageJson
} = require('../../lib/platform/aws-ecs/legacy/bom');

const FIXTURES = path.join(__dirname, 'fixtures', 'bom-trace');
const createBOMAsync = promisify(createBOM);

test('CJS processor with chained require + npm dep', async (_t) => {
  const script = path.join(FIXTURES, 'processor-cjs', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  const fileNames = bom.files.map((f) => f.noPrefix).sort();
  assert.ok(fileNames.includes('processor.js'), 'processor included');
  assert.ok(fileNames.includes('helper.js'), 'transitive local require included');
  assert.ok(fileNames.includes('script.yml'), 'script included');
  assert.ok(fileNames.includes('package.json'), 'package.json included');
  assert.ok(bom.modules.includes('lodash'), 'lodash detected as npm module');
  assert.ok(bom.moduleVersions.lodash, 'lodash version resolved');
});

test('Processor with missing relative import surfaces in externals', async (_t) => {
  const script = path.join(FIXTURES, 'processor-missing-import', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  const unresolved = bom.externals.filter(
    (e) => e.reason === 'unresolved-relative'
  );
  assert.strictEqual(unresolved.length, 1, 'single unresolved-relative entry');
  assert.strictEqual(unresolved[0].name, './not-here', 'records the original specifier');
});

// Regression: relative imports that a naive resolver probe misses (ESM-style
// '.js' specifier for a '.ts' file, directory import via package.json "main")
// used to be marked external and then classified as an npm package named
// '..' — which remote workers would try to `npm install`.
test('relative imports resolved by esbuild never become npm modules', async (_t) => {
  const script = path.join(FIXTURES, 'processor-relative-resolve', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  assert.strictEqual(bom.modules.filter((m) => m.startsWith('.') || m.startsWith('/')).length, 0, 'no relative/absolute specifiers in modules');
  assert.strictEqual(bom.externals.length, 0, 'no unresolved imports');

  const fileNames = bom.files.map((f) => f.noPrefix).sort();
  assert.ok(fileNames.includes('scenarios/processor.ts'), 'processor included');
  assert.ok(fileNames.includes('shared/helper.ts'), ".js specifier resolved to .ts file and included");
  assert.ok(fileNames.includes('lib/src.js'), 'directory import resolved via package.json main and included');
});

test('npm module imported but not declared in package.json', async (_t) => {
  const script = path.join(FIXTURES, 'processor-undeclared-pkg', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  assert.ok(bom.modules.includes('lodash'), 'lodash detected');
  const notInPkg = bom.externals.filter(
    (e) => e.reason === 'not-in-package-json' && e.name === 'lodash'
  );
  assert.strictEqual(notInPkg.length, 1, 'lodash flagged as not-in-package-json');
});

test('enrichPackageJson filters bundled and adds detected versions', async (_t) => {
  const original = JSON.stringify({
    name: 'x',
    dependencies: {
      lodash: '^4.0.0',
      artillery: '*',
      playwright: '*',
      '@playwright/test': '*'
    }
  });
  const enriched = JSON.parse(
    enrichPackageJson(original, {
      lodash: '4.17.21',
      'left-pad': '1.3.0'
    })
  );

  assert.ok(!(enriched.dependencies.artillery), 'artillery filtered');
  assert.ok(!(enriched.dependencies.playwright), 'playwright filtered');
  assert.ok(!(enriched.dependencies['@playwright/test']), '@playwright/* filtered');
  assert.strictEqual(enriched.dependencies.lodash, '^4.0.0', 'declared lodash range preserved');
  assert.strictEqual(enriched.dependencies['left-pad'], '1.3.0', 'detected undeclared module added at exact version');
});
