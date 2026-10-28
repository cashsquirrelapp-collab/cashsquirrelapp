export type SignInDecision = 'accept' | 'locked' | 'record-failure' | 'reject';

/** A lock blocks guesses, never a user who has supplied the correct password. */
export function decideSignIn(lockedForSeconds: number, hasSession: boolean, credentialsRejected: boolean): SignInDecision {
  if (hasSession) return 'accept';
  if (credentialsRejected) return lockedForSeconds > 0 ? 'locked' : 'record-failure';
  return 'reject';
}
