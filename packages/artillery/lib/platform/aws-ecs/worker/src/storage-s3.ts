import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  GetObjectCommand,
  PutObjectCommand,
  paginateListObjectsV2,
  S3Client
} from '@aws-sdk/client-s3';
import type { DownloadOutcome, Storage } from './storage.ts';
import { mapLimit } from './storage.ts';

const SYNC_CONCURRENCY = 8;

export function parseS3Url(url: string): { bucket: string; key: string } {
  const m = url.match(/^s3:\/\/([^/]+)\/?(.*)$/);
  if (!m) {
    throw new Error(`Not an S3 URL: ${url}`);
  }
  return { bucket: m[1], key: m[2] };
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === 'NoSuchKey' ||
    e?.name === 'NotFound' ||
    e?.$metadata?.httpStatusCode === 404
  );
}

export class S3Storage implements Storage {
  private client: S3Client;
  private testDataPath: string; // s3://bucket/tests/<id>
  private runDataPath: string; // s3://bucket/test-runs/<id>

  constructor(opts: {
    region: string;
    testDataPath: string;
    runDataPath: string;
  }) {
    this.testDataPath = opts.testDataPath;
    this.runDataPath = opts.runDataPath;
    // maxAttempts + bounded timeouts replace the retry/backoff behavior
    // the aws CLI provided implicitly (plan 8:11).
    this.client = new S3Client({
      region: opts.region,
      maxAttempts: 5,
      requestHandler: {
        connectionTimeout: 5000,
        requestTimeout: 120_000
      }
    });
  }

  async syncTestData(destDir: string): Promise<void> {
    const { bucket, key } = parseS3Url(this.testDataPath);
    const prefix = key.endsWith('/') ? key : `${key}/`;

    const keys: string[] = [];
    const paginator = paginateListObjectsV2(
      { client: this.client },
      { Bucket: bucket, Prefix: prefix }
    );
    for await (const page of paginator) {
      for (const obj of page.Contents ?? []) {
        if (!obj.Key || obj.Key.endsWith('/')) {
          continue;
        }
        const rel = obj.Key.slice(prefix.length);
        if (rel === 'node_modules_stream.zip') {
          continue;
        }
        keys.push(obj.Key);
      }
    }

    await mapLimit(keys, SYNC_CONCURRENCY, async (objKey) => {
      const rel = objKey.slice(prefix.length);
      const dest = path.join(destDir, rel);
      await this.getToFile(bucket, objKey, dest);
    });
  }

  async upload(localPath: string, ref: string): Promise<void> {
    const { bucket, key } = parseS3Url(ref);
    const { size } = await fs.stat(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(localPath),
        ContentLength: size
      })
    );
  }

  async download(ref: string, localPath: string): Promise<DownloadOutcome> {
    const { bucket, key } = parseS3Url(ref);
    try {
      await this.getToFile(bucket, key, localPath);
      return 'ok';
    } catch (err) {
      if (isNotFound(err)) {
        return 'notfound';
      }
      throw err;
    }
  }

  goSignalRef(): string {
    return `${this.runDataPath}/go.json`;
  }

  nodeModulesZipRef(): string {
    return `${this.testDataPath}/node_modules.zip`;
  }

  syncedMarkerRef(fileName: string): string {
    return `${this.runDataPath}/${fileName}`;
  }

  syncedMarkerDest(fileName: string): string {
    return `${this.runDataPath}/${fileName}`;
  }

  workerLogRef(workerId: string): string {
    return `${this.runDataPath}/worker-log-${workerId}.txt`;
  }

  async fetchHeartbeat(): Promise<string> {
    const { bucket, key } = parseS3Url(`${this.runDataPath}/heartbeat.json`);
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    return (await res.Body?.transformToString()) ?? '';
  }

  private async getToFile(
    bucket: string,
    key: string,
    dest: string
  ): Promise<void> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(res.Body as Readable, createWriteStream(dest));
  }
}
