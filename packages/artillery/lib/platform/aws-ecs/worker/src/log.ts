// Log helpers preserving the exact formats of the bash worker.
// See the rewrite plan (4:8) before changing any format here — some
// lines are grepped by humans/tests/Artillery Cloud.

export function progress(workerId: string, msg: string): void {
  console.log(`******** [${workerId}] ${msg}`);
}

// Bash `debug` printed each argument on its own line when DEBUG was
// set to any non-empty value.
export function debug(...parts: unknown[]): void {
  if (!process.env.DEBUG) {
    return;
  }
  for (const part of parts) {
    console.log(part);
  }
}
