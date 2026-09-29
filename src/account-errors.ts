/** Only explicitly authored account messages may cross into the UI. */
export class AccountError extends Error {
  constructor(message: string, readonly reason?: 'reauthenticate') { super(message); }
}

export function accountErrorMessage(error: unknown): string {
  return error instanceof AccountError ? error.message
    : 'The account operation could not complete. Check Codex and Account switching in Navigator setup before retrying.';
}

export function accountProtocolError(error: unknown): AccountError {
  // Classify private native diagnostics without returning their contents or tokens.
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (/refresh_token_(?:invalidated|expired|reused)|invalid_grant|401\s*(?:unauthorized)?|session has ended/i.test(message))
    return new AccountError('This saved Codex sign-in has expired or been invalidated. Sign in to this account again before switching.', 'reauthenticate');
  return new AccountError('Codex could not complete the account request. Check your connection and try again.');
}
