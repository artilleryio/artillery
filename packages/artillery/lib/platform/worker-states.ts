// Numeric values kept as-is (they are only ever assigned, never
// serialized or compared today); the const assertion gives each
// state a literal type.
const STATES = {
  initializing: 1,
  online: 2,
  preparing: 3,
  readyWaiting: 4,
  running: 5,
  unknown: 6,
  stoppedError: 7,
  completed: 8,
  stoppedEarly: 9,
  stoppedFailed: 10,
  timedout: 11
} as const;

export type WorkerState = (typeof STATES)[keyof typeof STATES];

export default STATES;
