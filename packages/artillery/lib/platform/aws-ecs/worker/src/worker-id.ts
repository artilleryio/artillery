import { randomInt } from 'node:crypto';
import type { WorkerMode } from './config.ts';
import { debug } from './log.ts';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Equivalent of `pwgen -A 12 1`: random 12-char lowercase alnum id.
export function randomWorkerId(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

// AWS: task id = 3rd '/'-segment of TaskARN from the ECS metadata
// endpoint. Metadata absence/failure falls back to WORKER_ID_OVERRIDE,
// then a random id (bash crashed on unbound var — deliberate deviation
// to enable local runs; identical behavior on Fargate).
export async function resolveWorkerId(
  mode: WorkerMode,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (mode === 'aws' && env.ECS_CONTAINER_METADATA_URI_V4) {
    try {
      const res = await fetch(`${env.ECS_CONTAINER_METADATA_URI_V4}/task`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = (await res.json()) as { TaskARN?: string };
      const id = data.TaskARN?.split('/')[2];
      if (id) {
        return id;
      }
    } catch (err) {
      debug(`Could not fetch ECS metadata: ${(err as Error).message}`);
    }
  }
  return env.WORKER_ID_OVERRIDE || randomWorkerId();
}
