// Stubs for B9-B10. Implementation lands in a later dispatch; every export
// throws "not implemented" so red-state failures are unambiguous.

export class MissingProvenanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MissingProvenanceError';
  }
}

export class DirtyTreeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DirtyTreeError';
  }
}

export function validateTasks(_options) {
  throw new Error('not implemented');
}

export function checkPreregistration(_options) {
  throw new Error('not implemented');
}
