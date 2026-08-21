import { randomUUID } from 'node:crypto';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { bestEffort, type MessageBus } from './bus.ts';
import { debug } from './log.ts';

const SEND_TIMEOUT_MS = 10_000;

// SQS FIFO sender. Consumed by SqsReporter on the controller — it
// requires MessageAttributes testId + workerId; MessageGroupId is the
// test run id; dedup id just needs to be unique (bash used pwgen).
export class SqsBus implements MessageBus {
  private client: SQSClient;
  private queueUrl: string;
  private testRunId: string;
  private workerId: string;

  constructor(opts: {
    queueUrl: string;
    region: string;
    testRunId: string;
    workerId: string;
  }) {
    this.queueUrl = opts.queueUrl;
    this.testRunId = opts.testRunId;
    this.workerId = opts.workerId;
    this.client = new SQSClient({
      region: opts.region,
      maxAttempts: 5,
      requestHandler: {
        connectionTimeout: 5000,
        requestTimeout: 120_000
      }
    });
  }

  async sendMessage(body: string, type: string): Promise<void> {
    await bestEffort(() => this.send(JSON.stringify({ msg: body, type })), {
      retries: 0,
      timeoutMs: SEND_TIMEOUT_MS
    });
  }

  async sendEvent(payload: Record<string, unknown>): Promise<void> {
    debug(`Message body: ${JSON.stringify(payload)}`);
    await bestEffort(() => this.send(JSON.stringify(payload)), {
      retries: 1,
      timeoutMs: SEND_TIMEOUT_MS
    });
  }

  private async send(messageBody: string): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: messageBody,
        MessageAttributes: {
          testId: { DataType: 'String', StringValue: this.testRunId },
          workerId: { DataType: 'String', StringValue: this.workerId }
        },
        MessageGroupId: this.testRunId,
        MessageDeduplicationId: randomUUID()
      })
    );
  }
}
