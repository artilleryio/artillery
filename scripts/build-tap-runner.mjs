// Rebuild tap's generated test-runner class without @tapjs/typescript.
//
// Why: @tapjs/typescript installs a ts-node require-extension hook in
// every spawned test process, which rejects require() of ES-module .ts
// files (our packages) and bypasses Node's native type stripping. All
// package tap configs disable the plugin ("plugin": ["!@tapjs/typescript"]),
// but tap only rebuilds its runner *during* the first run after a fresh
// npm install - and that first run still spawns test processes with the
// stale default plugin set. In CI every run is a first run, so tests
// fail there while passing locally.
//
// Running this from the root postinstall hook makes the build correct
// before tap ever runs. The plugin list is derived from tap's own
// defaults so it tracks tap upgrades.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(repoRoot, 'package.json'));

let testPkgDir;
try {
  testPkgDir = path.dirname(require.resolve('@tapjs/test/package.json'));
} catch {
  console.log('build-tap-runner: @tapjs/test not installed, skipping');
  process.exit(0);
}

const { defaultPlugins } = await import(
  path.join(testPkgDir, 'dist/esm/default-plugins.js')
);
const plugins = defaultPlugins.filter((p) => p !== '@tapjs/typescript');

const buildScript = path.join(testPkgDir, 'dist/esm/build.mjs');
const res = spawnSync(process.execPath, [buildScript, ...plugins], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (res.status !== 0) {
  console.error('build-tap-runner: tap test class build failed');
  process.exit(res.status ?? 1);
}
console.log(
  `build-tap-runner: built tap runner with ${plugins.length} plugins (no @tapjs/typescript)`
);
