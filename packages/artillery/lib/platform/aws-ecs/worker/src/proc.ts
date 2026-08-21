import {
  type ChildProcess,
  spawn
} from 'node:child_process';
import { createWriteStream } from 'node:fs';
import os from 'node:os';

// Same convention as bash `echo $?`: signal-terminated children map to
// 128 + signal number (SIGKILL -> 137, SIGTERM -> 143).
export function exitCodeOf(
  code: number | null,
  signal: NodeJS.Signals | null
): number {
  if (typeof code === 'number') {
    return code;
  }
  const signals = os.constants.signals as Record<string, number>;
  const num = signal ? signals[signal] : undefined;
  return 128 + (num ?? 1);
}

// Spawn a child, stream its output to our stdout/stderr, resolve with
// its exit code. Rejects on spawn failure (e.g. binary not found).
export function spawnAndWait(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ['ignore', 'inherit', 'inherit']
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve(exitCodeOf(code, signal));
    });
  });
}

export interface TeeChild {
  child: ChildProcess;
  // Resolves with the mapped exit code after the output file is flushed.
  exited: Promise<number>;
}

// Equivalent of `cmd | tee outputFile`, except both stdout and stderr
// are captured (live passthrough + copy in outputFile).
export function spawnTee(
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; outputFile: string }
): TeeChild {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const fileStream = createWriteStream(opts.outputFile);

  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
    fileStream.write(chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(chunk);
    fileStream.write(chunk);
  });

  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', (err) => {
      fileStream.end();
      reject(err);
    });
    child.once('exit', (code, signal) => {
      fileStream.end(() => {
        resolve(exitCodeOf(code, signal));
      });
    });
  });

  return { child, exited };
}

export function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

// Resolves true if the child exited within timeoutMs, false otherwise.
export function waitForChildExit(
  child: ChildProcess,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!isRunning(child)) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve(false);
    }, timeoutMs);
    timer.unref();
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    child.once('exit', onExit);
  });
}

// SIGTERM now; SIGKILL after graceMs if the child is still alive.
export function killWithGrace(child: ChildProcess, graceMs: number): void {
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (isRunning(child)) {
      child.kill('SIGKILL');
    }
  }, graceMs);
  timer.unref();
}
