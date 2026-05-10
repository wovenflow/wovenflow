// Stubs for B1-B3. Implementation lands in a later dispatch; every export
// throws "not implemented" so red-state failures are unambiguous.

export class ProtocolValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtocolValidationError';
  }
}

export function loadProtocol(_path) {
  throw new Error('not implemented');
}

export function dispatchTrial(_options) {
  // Note: B2's first test awaits this; the second test wraps it in
  // assert.throws and expects a synchronous throw. Throwing synchronously
  // satisfies both: an awaited synchronous throw still rejects.
  throw new Error('not implemented');
}

export async function captureTrial(_options) {
  throw new Error('not implemented');
}
