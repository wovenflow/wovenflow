// Stubs for B4-B6. Implementation lands in a later dispatch; every export
// throws "not implemented" so red-state failures are unambiguous.

export class HiddenTestLeakError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HiddenTestLeakError';
  }
}

export class MissingPredicatesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingPredicatesError';
  }
}

export async function scoreHidden(_options) {
  throw new Error('not implemented');
}

export async function scoreSelf(_options) {
  throw new Error('not implemented');
}

export async function scoreCoverage(_options) {
  throw new Error('not implemented');
}
