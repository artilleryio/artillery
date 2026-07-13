class TestNotFoundError extends Error {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  constructor(message?) {
    super(message);
    this.name = 'TestNotFoundError';
  }
}

class NoAvailableQueueError extends Error {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  constructor(message?) {
    super(message);
    this.name = 'NoAvailableQueueError';
  }
}

class ClientServerVersionMismatchError extends Error {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  constructor(message?) {
    super(message);
    this.name = 'ClientServerMismatchError';
  }
}

class ConsoleOutputSerializeError extends Error {
  // Untyped JS class - properties assigned dynamically
  [key: string]: any;

  constructor(message?) {
    super(message);
    this.name = 'OutputSerializeError';
  }
}

export { TestNotFoundError, NoAvailableQueueError, ClientServerVersionMismatchError, ConsoleOutputSerializeError };