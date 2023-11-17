class TestNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TestNotFoundError';
  }
}

class NoAvailableQueueError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NoAvailableQueueError';
  }
}

class ClientServerVersionMismatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClientServerMismatchError';
  }
}

class ConsoleOutputSerializeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OutputSerializeError';
  }
}

module.exports = {
  TestNotFoundError,
  NoAvailableQueueError,
  ClientServerVersionMismatchError,
  ConsoleOutputSerializeError
};
