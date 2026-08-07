import EventEmitter from 'node:events';
import driftless from 'driftless';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Timeout extends EventEmitter {
  declare _startedAt: number | null;
  declare _duration: number;
  declare _timeout: number;

  constructor(duration: number) {
    super();
    this._startedAt = null;
    this._duration = duration;
  }

  start() {
    this._startedAt = Date.now();
    this._timeout = driftless.setDriftlessTimeout(() => {
      this.emit('timeout');
    }, this._duration);
    return this;
  }

  stop() {
    driftless.clearDriftless(this._timeout);
    return this;
  }

  timedout() {
    // NOTE: pre-existing behavior: NaN comparison (false) when called
    // before start().
    return Date.now() - (this._startedAt as number) > this._duration;
  }
}

// Turn a string like 2m into number of milliseconds
// Supported units: ms, s, m, h
function timeStringToMs(timeStr: string): number {
  const rx = /^([0-9]+).+$/i;

  if (!rx.test(timeStr)) {
    throw new Error(`Invalid time string: ${timeStr}`);
  }

  let multiplier = 0;
  if (timeStr.endsWith('ms')) {
    multiplier = 1;
  } else if (timeStr.endsWith('s')) {
    multiplier = 1000;
  } else if (timeStr.endsWith('m')) {
    multiplier = 60 * 1000;
  } else if (timeStr.endsWith('h')) {
    multiplier = 60 * 60 * 1000;
  } else {
    throw new Error(
      `Unknown unit suffix in ${timeStr}. Supported units: ms, s, m, h`
    );
  }

  // Non-null: rx.test(timeStr) is checked above.
  const n = parseInt((timeStr.match(rx) as RegExpMatchArray)[0], 10);
  return n * multiplier;
}

export { Timeout, sleep, timeStringToMs };
