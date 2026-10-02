/**
 * An error caused by configuration or input that the user can fix: a missing API key, an
 * invalid PR URL, an empty diff. The CLI prints only the message, without a stack trace.
 */
export class UserError extends Error {
  override readonly name = 'UserError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
