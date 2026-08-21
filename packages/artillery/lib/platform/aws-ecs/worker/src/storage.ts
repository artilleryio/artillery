import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { EXIT, WorkerError } from './config.ts';

export type DownloadOutcome = 'ok' | 'notfound';

// Object storage adapter (S3 or Azure Blob). Refs are opaque strings:
// full s3:// URLs on AWS, blob names (e.g. tests/<id>/go.json) on Azure.
// The same strings appear in preserved log lines.
export interface Storage {
  // Download the whole test bundle into destDir, preserving relative
  // paths (node_modules_stream.zip excluded).
  syncTestData(destDir: string): Promise<void>;
  upload(localPath: string, ref: string): Promise<void>;
  // 'notfound' when the object does not exist; throws on other errors.
  download(ref: string, localPath: string): Promise<DownloadOutcome>;
  goSignalRef(): string;
  nodeModulesZipRef(): string;
  syncedMarkerRef(fileName: string): string;
  // Human-readable destination used in the sync-failure log line.
  syncedMarkerDest(fileName: string): string;
  // null = worker log upload not supported (Azure).
  workerLogRef(workerId: string): string | null;
  // Body of test-runs/<id>/heartbeat.json; throws on any failure.
  fetchHeartbeat(): Promise<string>;
}

// Shared bounded-concurrency helper for bundle downloads.
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const idx = next++;
        await fn(items[idx]);
      }
    }
  );
  await Promise.all(workers);
}

// Poll for an object every 2s until it downloads or WAIT_TIMEOUT is
// reached (bash wait_for_go). Non-notfound errors are logged and
// retried until the timeout — matches `aws s3 cp` retry-on-any-failure.
export async function waitForObject(
  storage: Storage,
  ref: string,
  destDir: string,
  timeoutSec: number
): Promise<void> {
  const SLEEP_SEC = 2;
  let slept = 0;

  console.log(`Waiting... (${ref})`);

  while (true) {
    let outcome: DownloadOutcome = 'notfound';
    try {
      outcome = await storage.download(
        ref,
        path.join(destDir, path.posix.basename(ref))
      );
    } catch (err) {
      console.log(
        `\nWarning: error while waiting for ${ref}: ${(err as Error).message}`
      );
    }

    if (outcome === 'ok') {
      break;
    }

    if (slept >= timeoutSec) {
      console.log('Timed out waiting for go signal');
      throw new WorkerError(
        EXIT.ERR_GO_TIMEOUT,
        'Timed out waiting for go signal'
      );
    }

    process.stdout.write('.');
    await sleep(SLEEP_SEC * 1000);
    slept += SLEEP_SEC;
  }
}
