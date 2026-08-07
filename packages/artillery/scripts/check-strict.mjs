// Strict type-checking ratchet for packages/artillery.
//
// Runs tsc with tsconfig.strict.json over the whole lib graph and
// compares diagnostics against scripts/strict-exceptions.json - the
// list of files that are still allowed to have strict errors.
//
// Fails when:
//   - a file NOT on the exception list has strict errors (regression,
//     or a new file that is not strict-clean)
//   - a file on the exception list is now clean (ratchet: remove it
//     from the list so it cannot regress)
//
// The exception list may only shrink. Do not add files to it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const exceptionsPath = path.join(__dirname, 'strict-exceptions.json');

const exceptions = new Set(JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')));

let output = '';
try {
  output = execFileSync(
    process.execPath,
    [
      path.join(pkgDir, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      path.join(pkgDir, 'tsconfig.strict.json'),
      '--pretty',
      'false'
    ],
    { cwd: pkgDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
} catch (err) {
  // tsc exits non-zero when there are diagnostics - that is expected
  // while the exception list is non-empty.
  output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  if (!err.stdout && !err.stderr) {
    throw err;
  }
}

// Diagnostic lines look like: lib/foo/bar.ts(12,34): error TS7006: ...
const errorsByFile = new Map();
for (const line of output.split('\n')) {
  const m = line.match(/^(.+?\.ts)\(\d+,\d+\): error TS\d+/);
  if (!m) {
    continue;
  }
  // Normalize to posix-style path relative to the package dir.
  const file = path.posix.normalize(m[1].split(path.sep).join('/'));
  if (!errorsByFile.has(file)) {
    errorsByFile.set(file, []);
  }
  errorsByFile.get(file).push(line);
}

const regressions = [];
for (const [file, lines] of errorsByFile) {
  if (!exceptions.has(file)) {
    regressions.push({ file, lines });
  }
}

const nowClean = [...exceptions].filter((file) => !errorsByFile.has(file));

let failed = false;

if (regressions.length > 0) {
  failed = true;
  console.error(
    'Strict check failed. Errors in files not on the exception list:\n'
  );
  for (const { file, lines } of regressions) {
    for (const line of lines) {
      console.error(`  ${line}`);
    }
    console.error('');
    void file;
  }
  console.error(
    'Fix the errors above. Do not add files to scripts/strict-exceptions.json.'
  );
}

if (nowClean.length > 0) {
  failed = true;
  console.error(
    '\nThese files are now strict-clean. Remove them from scripts/strict-exceptions.json so they cannot regress:\n'
  );
  for (const file of nowClean) {
    console.error(`  ${file}`);
  }
}

const totalErrors = [...errorsByFile.values()].reduce(
  (n, l) => n + l.length,
  0
);
const cleanCount =
  [...errorsByFile.keys()].length === 0
    ? 'all'
    : `${exceptions.size - nowClean.length} remaining exception file(s)`;

if (failed) {
  process.exit(1);
}

console.log(
  `Strict check OK. ${totalErrors} known error(s) across ${cleanCount}; exception list has ${exceptions.size} file(s).`
);
