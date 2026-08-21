import fs from 'node:fs/promises';
import path from 'node:path';
import { ClientSecretCredential } from '@azure/identity';
import {
  BlobServiceClient,
  type ContainerClient
} from '@azure/storage-blob';
import type { DownloadOutcome, Storage } from './storage.ts';
import { mapLimit } from './storage.ts';

const SYNC_CONCURRENCY = 8;

// Service principal credential from env vars — same env vars the
// python azure-storage-helper used.
export function createAzureCredential(
  env: NodeJS.ProcessEnv = process.env
): ClientSecretCredential {
  const tenantId = env.AZURE_TENANT_ID;
  const clientId = env.AZURE_CLIENT_ID;
  const clientSecret = env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      'AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET must be set'
    );
  }
  return new ClientSecretCredential(tenantId, clientId, clientSecret);
}

// The SDK authenticates lazily per-request; this validates creds
// upfront to fail fast (same purpose as azure-storage-helper login).
export async function azureCredentialCheck(
  credential: ClientSecretCredential
): Promise<void> {
  await credential.getToken('https://storage.azure.com/.default');
}

function isNotFound(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 404;
}

export class AzureBlobStorage implements Storage {
  private containerClient: ContainerClient;
  private containerName: string;
  private testRunId: string;

  constructor(opts: {
    containerName: string;
    testRunId: string;
    credential: ClientSecretCredential;
    env?: NodeJS.ProcessEnv;
  }) {
    const env = opts.env ?? process.env;
    const account = env.AZURE_STORAGE_ACCOUNT;
    if (!account) {
      throw new Error('AZURE_STORAGE_ACCOUNT must be set');
    }
    this.containerName = opts.containerName;
    this.testRunId = opts.testRunId;
    const serviceClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      opts.credential
    );
    this.containerClient = serviceClient.getContainerClient(
      opts.containerName
    );
  }

  async syncTestData(destDir: string): Promise<void> {
    const prefix = `tests/${this.testRunId}/`;

    const names: string[] = [];
    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      const rel = blob.name.slice(prefix.length);
      if (rel === '' || rel === 'node_modules_stream.zip') {
        continue;
      }
      names.push(blob.name);
    }

    // Prefix is stripped: the bundle lands directly in destDir (bash
    // did download-batch + a mv shuffle for the same net effect).
    await mapLimit(names, SYNC_CONCURRENCY, async (name) => {
      const rel = name.slice(prefix.length);
      const dest = path.join(destDir, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await this.containerClient.getBlobClient(name).downloadToFile(dest);
    });
  }

  async upload(localPath: string, ref: string): Promise<void> {
    await this.containerClient.getBlockBlobClient(ref).uploadFile(localPath);
  }

  async download(ref: string, localPath: string): Promise<DownloadOutcome> {
    try {
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await this.containerClient.getBlobClient(ref).downloadToFile(localPath);
      return 'ok';
    } catch (err) {
      if (isNotFound(err)) {
        return 'notfound';
      }
      throw err;
    }
  }

  goSignalRef(): string {
    return `tests/${this.testRunId}/go.json`;
  }

  nodeModulesZipRef(): string {
    return `tests/${this.testRunId}/node_modules.zip`;
  }

  syncedMarkerRef(fileName: string): string {
    return `tests/${this.testRunId}/${fileName}`;
  }

  syncedMarkerDest(fileName: string): string {
    // Bash printed container/<file> (without the tests/<id>/ prefix).
    return `${this.containerName}/${fileName}`;
  }

  workerLogRef(_workerId: string): null {
    // No worker log upload on Azure (parity with bash).
    return null;
  }

  fetchHeartbeat(): Promise<string> {
    // No heartbeat monitoring on Azure (parity with bash).
    return Promise.reject(
      new Error('Heartbeat monitoring not supported on Azure')
    );
  }
}
