const promisify = require('node:util').promisify;
const path = require('node:path');
const { test } = require('tap');
const {
  createBOM,
  enrichPackageJson
} = require('../../lib/platform/aws-ecs/legacy/bom');

const FIXTURES = path.join(__dirname, 'fixtures', 'bom-trace');
const createBOMAsync = promisify(createBOM);

test('CJS processor with chained require + npm dep', async (t) => {
  const script = path.join(FIXTURES, 'processor-cjs', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  const fileNames = bom.files.map((f) => f.noPrefix).sort();
  t.ok(fileNames.includes('processor.js'), 'processor included');
  t.ok(fileNames.includes('helper.js'), 'transitive local require included');
  t.ok(fileNames.includes('script.yml'), 'script included');
  t.ok(fileNames.includes('package.json'), 'package.json included');
  t.ok(bom.modules.includes('lodash'), 'lodash detected as npm module');
  t.ok(bom.moduleVersions.lodash, 'lodash version resolved');
});

test('Processor with missing relative import surfaces in externals', async (t) => {
  const script = path.join(FIXTURES, 'processor-missing-import', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  const unresolved = bom.externals.filter(
    (e) => e.reason === 'unresolved-relative'
  );
  t.equal(unresolved.length, 1, 'single unresolved-relative entry');
  t.equal(unresolved[0].name, './not-here', 'records the original specifier');
});

test('npm module imported but not declared in package.json', async (t) => {
  const script = path.join(FIXTURES, 'processor-undeclared-pkg', 'script.yml');
  const bom = await createBOMAsync(script, [], {
    scenarioPath: script,
    flags: {}
  });

  t.ok(bom.modules.includes('lodash'), 'lodash detected');
  const notInPkg = bom.externals.filter(
    (e) => e.reason === 'not-in-package-json' && e.name === 'lodash'
  );
  t.equal(notInPkg.length, 1, 'lodash flagged as not-in-package-json');
});

test('enrichPackageJson filters bundled and adds detected versions', async (t) => {
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

  t.notOk(enriched.dependencies.artillery, 'artillery filtered');
  t.notOk(enriched.dependencies.playwright, 'playwright filtered');
  t.notOk(
    enriched.dependencies['@playwright/test'],
    '@playwright/* filtered'
  );
  t.equal(
    enriched.dependencies.lodash,
    '^4.0.0',
    'declared lodash range preserved'
  );
  t.equal(
    enriched.dependencies['left-pad'],
    '1.3.0',
    'detected undeclared module added at exact version'
  );
});
