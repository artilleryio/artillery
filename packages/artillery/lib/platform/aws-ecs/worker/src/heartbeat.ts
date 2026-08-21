import { debug } from './log.ts';

// Watches the controller-written heartbeat object (test-runs/<id>/
// heartbeat.json, epoch-ms string, refreshed every 60s). If the
// heartbeat goes stale the worker kills the CLI and exits with
// ERR_HEARTBEAT_TIMEOUT. AWS only.
//
// Semantics preserved from bash check_heartbeat:
// - grace period of 180s from monitor start;
// - check every 60s;
// - fetch failure (incl. missing object) -> warning, retry next cycle;
// - empty body -> timeout;
// - age > 180s -> timeout.

export interface HeartbeatMonitorOptions {
  fetchHeartbeat: () => Promise<string>;
  onTimeout: () => void;
  graceMs?: number;
  intervalMs?: number;
  thresholdSec?: number;
  now?: () => number;
  log?: (msg: string) => void;
}

export class HeartbeatMonitor {
  timedOut = false;

  private fetchHeartbeat: () => Promise<string>;
  private onTimeout: () => void;
  private graceMs: number;
  private intervalMs: number;
  private thresholdSec: number;
  private now: () => number;
  private log: (msg: string) => void;
  private timer: NodeJS.Timeout | null = null;
  private startedAt = 0;
  private ticking = false;

  constructor(opts: HeartbeatMonitorOptions) {
    this.fetchHeartbeat = opts.fetchHeartbeat;
    this.onTimeout = opts.onTimeout;
    this.graceMs = opts.graceMs ?? 180_000;
    this.intervalMs = opts.intervalMs ?? 60_000;
    this.thresholdSec = opts.thresholdSec ?? 180;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((msg) => console.log(msg));
  }

  start(): void {
    this.startedAt = this.now();
    debug(
      `Heartbeat monitor started (grace=${Math.floor(
        this.graceMs / 1000
      )}s, threshold=${this.thresholdSec}s)`
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.ticking || this.timedOut) {
      return;
    }
    this.ticking = true;
    try {
      const elapsed = this.now() - this.startedAt;
      if (elapsed < this.graceMs) {
        debug(
          `Heartbeat: grace period (${Math.floor(
            elapsed / 1000
          )}s < ${Math.floor(this.graceMs / 1000)}s)`
        );
        return;
      }

      let body: string;
      try {
        body = await this.fetchHeartbeat();
      } catch (_err) {
        this.log(
          'WARNING: Heartbeat S3 fetch failed (exit=1), retrying next cycle'
        );
        return;
      }

      const trimmed = body.trim();
      if (trimmed === '') {
        this.log('ERROR: No CLI heartbeat detected. Terminating worker.');
        this.trigger();
        return;
      }

      const latestTs = Number(trimmed);
      if (!Number.isFinite(latestTs)) {
        // Bash crashed its monitor subshell here; warn-and-retry instead.
        this.log(
          'WARNING: Invalid heartbeat timestamp, retrying next cycle'
        );
        return;
      }

      const ageS = Math.floor((this.now() - latestTs) / 1000);
      debug(`Heartbeat: latest=${latestTs}, age=${ageS}s`);

      if (ageS > this.thresholdSec) {
        this.log(
          `ERROR: CLI heartbeat expired (${ageS}s old). Terminating worker.`
        );
        this.trigger();
      }
    } finally {
      this.ticking = false;
    }
  }

  private trigger(): void {
    this.timedOut = true;
    this.stop();
    this.onTimeout();
  }
}
