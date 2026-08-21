import { debug } from './log.ts';

// Queue channel from worker to controller. All sends are best-effort:
// they never throw (bash appended `|| true` to every send). The final
// workerDone/workerError event gets one retry and a bounded timeout.
export interface MessageBus {
  // Body shape: {"msg": <body>, "type": <type>}; type: debug|leader|ensure
  sendMessage(body: string, type: string): Promise<void>;
  // Payload sent as-is: {"event": "workerDone"} etc.
  sendEvent(payload: Record<string, unknown>): Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${ms}ms`)),
      ms
    );
    timer.unref();
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function bestEffort(
  fn: () => Promise<void>,
  opts: { retries: number; timeoutMs: number }
): Promise<void> {
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      await withTimeout(fn(), opts.timeoutMs);
      return;
    } catch (err) {
      debug(
        `queue send failed (attempt ${attempt + 1}): ${(err as Error).message}`
      );
    }
  }
}
