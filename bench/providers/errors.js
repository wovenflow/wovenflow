// Shared error type for the provider abstraction.
//
// Lifted into its own module so provider adapters and the runner can both
// import it without a circular dependency. The runner re-exports it as
// `ProviderConfigError` per the spec.

export class ProviderConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProviderConfigError';
  }
}
