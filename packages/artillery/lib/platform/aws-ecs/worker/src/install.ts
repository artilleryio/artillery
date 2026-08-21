import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MessageBus } from './bus.ts';
import { EXIT, type WorkerConfig, WorkerError } from './config.ts';
import { debug } from './log.ts';
import { generateNpmrc } from './npmrc.ts';
import { spawnAndWait } from './proc.ts';
import type { Storage } from './storage.ts';
import { waitForObject } from './storage.ts';
import { renderTree } from './tree.ts';

const epochSec = () => Math.floor(Date.now() / 1000);

export async function installDependencies(
  cfg: WorkerConfig,
  storage: Storage,
  bus: MessageBus
): Promise<void> {
  const testData = cfg.testDataDir;

  try {
    debug(await fs.readFile(path.join(testData, 'metadata.json'), 'utf8'));
  } catch {
    // metadata.json missing — logged as absent below via readModules
  }

  // Needed to install all packages to the dir of the test files. Also
  // inherited by the CLI child so its plugins resolve from here first.
  process.env.NODE_PATH = `${path.join(testData, 'node_modules')}:${
    process.env.NODE_PATH ?? ''
  }`;

  const { npmrc, diagnostics } = generateNpmrc(process.env);
  for (const line of diagnostics) {
    console.log(line);
  }
  await fs.appendFile(path.join(os.homedir(), '.npmrc'), npmrc);

  if (cfg.isLeader) {
    await leaderInstall(cfg, storage, bus);
  } else {
    await followerInstall(cfg, storage, bus);
  }

  console.log(renderTree(testData, ['node_modules']));
}

// Leader: pre-install modules for everyone else, zip and upload.
async function leaderInstall(
  cfg: WorkerConfig,
  storage: Storage,
  bus: MessageBus
): Promise<void> {
  const testData = cfg.testDataDir;

  await bus.sendMessage(`leader npm pack start ${epochSec()}`, 'debug');

  await installNpmDependencies(cfg);

  if (!existsSync(path.join(testData, 'node_modules'))) {
    await fs.mkdir(path.join(testData, 'node_modules'), { recursive: true });
    await fs.writeFile(
      path.join(testData, 'node_modules', '.artillery'),
      ''
    );
  }

  // System Info-ZIP binary, same artifact format as before.
  const zipStatus = await spawnAndWait(
    'zip',
    ['-r', '-q', 'node_modules.zip', 'node_modules'],
    { cwd: testData }
  );
  if (zipStatus !== 0) {
    throw new Error(`zip exited with code ${zipStatus}`);
  }
  console.log('Modules pre-packaged');

  await storage.upload(
    path.join(testData, 'node_modules.zip'),
    storage.nodeModulesZipRef()
  );

  await bus.sendMessage(`leader npm prepack end ${epochSec()}`, 'debug');
  await bus.sendMessage('prepack_end', 'leader');
}

// Follower: wait for the leader's node_modules.zip and unpack it.
async function followerInstall(
  cfg: WorkerConfig,
  storage: Storage,
  bus: MessageBus
): Promise<void> {
  const testData = cfg.testDataDir;

  await bus.sendMessage(
    `follower npm prepack wait start ${epochSec()}`,
    'debug'
  );

  await waitForObject(
    storage,
    storage.nodeModulesZipRef(),
    testData,
    cfg.waitTimeoutSec
  );

  const unzipStatus = await spawnAndWait(
    'unzip',
    ['-o', '-q', 'node_modules.zip'],
    { cwd: testData }
  );
  if (unzipStatus !== 0) {
    throw new Error(`unzip exited with code ${unzipStatus}`);
  }

  await bus.sendMessage(
    `follower npm prepack wait end ${epochSec()}`,
    'debug'
  );
}

async function installNpmDependencies(cfg: WorkerConfig): Promise<void> {
  const testData = cfg.testDataDir;

  // Anchor npm to the test-data dir before installing any BOM-detected
  // module. Without a package.json here, `npm install <pkg>` walks up
  // looking for a project root and lands on /artillery and rebuilds
  // /artillery/node_modules to match the synthetic dep set it generates
  // from <pkg>, deleting everything the artillery CLI needs.
  if (!existsSync(path.join(testData, 'package.json'))) {
    await runOrFail('npm', ['init', '-y', '--quiet'], testData);
  }

  const modules = await readModules(testData);
  if (modules !== null) {
    console.log('Installing required npm dependencies');
    for (const dep of modules) {
      console.log(`installing ${dep}`);
      await runOrFail('npm', ['install', '--quiet', dep], testData);
    }
  } else {
    console.log('No extra npm modules to install');
  }

  console.log('Installing dependencies in package.json');
  if (existsSync(path.join(testData, 'yarn.lock'))) {
    await runOrFail('yarn', ['install'], testData);
  } else {
    await runOrFail('npm', ['install', '--loglevel=silent'], testData);
    console.log('npm install completed');
  }
}

// metadata.json .modules is string[]|null. A missing/unreadable
// metadata.json is treated as "no extra modules".
async function readModules(testData: string): Promise<string[] | null> {
  let metadata: { modules?: unknown };
  try {
    metadata = JSON.parse(
      await fs.readFile(path.join(testData, 'metadata.json'), 'utf8')
    );
  } catch (err) {
    debug(`Could not read metadata.json: ${(err as Error).message}`);
    return null;
  }
  if (!Array.isArray(metadata.modules)) {
    return null;
  }
  return metadata.modules.map(String);
}

// Any npm/yarn failure -> ERR_DEP_INSTALL (bash's npm-debug.log check
// was dead code and yarn failures leaked into the exit-0 trap; fixed).
async function runOrFail(
  cmd: string,
  args: string[],
  cwd: string
): Promise<void> {
  let status: number;
  try {
    status = await spawnAndWait(cmd, args, { cwd });
  } catch (err) {
    console.error(
      `${cmd} ${args.join(' ')} failed: ${(err as Error).message}`
    );
    throw new WorkerError(EXIT.ERR_DEP_INSTALL, `${cmd} failed to start`);
  }
  if (status !== 0) {
    console.error(`${cmd} ${args.join(' ')} exited with code ${status}`);
    throw new WorkerError(
      EXIT.ERR_DEP_INSTALL,
      `${cmd} exited with code ${status}`
    );
  }
}
