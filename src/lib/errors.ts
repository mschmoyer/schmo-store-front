/**
 * Helpers for working with values caught in `catch` blocks.
 *
 * TypeScript types the binding of a `catch` clause as `unknown`, because any
 * value can be thrown. These helpers narrow such a value without casting.
 */

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * @param error - Value caught from a `catch` block or a rejected promise
 * @returns The error's message, the value itself when it is a string, or a
 *          generic fallback for values that carry no message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown };
    if (typeof message === 'string') {
      return message;
    }
  }

  return 'Unknown error';
}

/**
 * Convert an unknown thrown value into an `Error`.
 *
 * @param error - Value caught from a `catch` block or a rejected promise
 * @returns The value itself when it is already an `Error`, otherwise a new
 *          `Error` carrying the extracted message
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error));
}
