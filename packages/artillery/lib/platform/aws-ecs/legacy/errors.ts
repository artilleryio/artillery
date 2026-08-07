class TestNotFoundError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'TestNotFoundError';
  }
}

class NoAvailableQueueError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'NoAvailableQueueError';
  }
}

class ClientServerVersionMismatchError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'ClientServerMismatchError';
  }
}

class ConsoleOutputSerializeError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'OutputSerializeError';
  }
}

export {
  TestNotFoundError,
  NoAvailableQueueError,
  ClientServerVersionMismatchError,
  ConsoleOutputSerializeError
};
