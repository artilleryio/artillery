import type { ClientSecretCredential } from '@azure/identity';
import { QueueClient } from '@azure/storage-queue';
import { bestEffort, type MessageBus } from './bus.ts';
import { debug } from './log.ts';

const SEND_TIMEOUT_MS = 10_000;

// Azure Queue Storage sender. Message text is raw JSON (no base64):
//   {"payload": <body>, "attributes": {"testId": "...", "workerId": "..."}}
// Consumed by az/aqs-queue-consumer.ts + handler in aci.ts.
export class AqsBus implements MessageBus {
  private queueClient: QueueClient;
  private testRunId: string;
  private workerId: string;

  constructor(opts: {
    queueName: string;
    storageAccount: string;
    credential: ClientSecretCredential;
    testRunId: string;
    workerId: string;
  }) {
    this.testRunId = opts.testRunId;
    this.workerId = opts.workerId;
    this.queueClient = new QueueClient(
      `https://${opts.storageAccount}.queue.core.windows.net/${opts.queueName}`,
      opts.credential
    );
  }

  async sendMessage(body: string, type: string): Promise<void> {
    await bestEffort(() => this.send({ msg: body, type }), {
      retries: 0,
      timeoutMs: SEND_TIMEOUT_MS
    });
  }

  async sendEvent(payload: Record<string, unknown>): Promise<void> {
    debug(`Message body: ${JSON.stringify(payload)}`);
    await bestEffort(() => this.send(payload), {
      retries: 1,
      timeoutMs: SEND_TIMEOUT_MS
    });
  }

  private async send(payload: Record<string, unknown>): Promise<void> {
    await this.queueClient.sendMessage(
      JSON.stringify({
        payload,
        attributes: { testId: this.testRunId, workerId: this.workerId }
      })
    );
  }
}
