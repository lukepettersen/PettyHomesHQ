// How long a sign-in lasts (SPEC.md §4). Pure, unit tested in session.test.ts.

export const SHORT_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours from sign-in
export const REMEMBER_DAYS = 400; // "Keep me signed in on this device": browsers cap cookies at 400 days
export const REMEMBER_COOKIE = "hq_remember";

/** A sign-in is good if the device was remembered, or it's less than 12 hours old. */
export function signInStillGood(token: Record<string, unknown> | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  if (token.remember === true) return true;
  const at = Number(token.loginAt);
  return !Number.isFinite(at) || at <= 0 ? true : now - at < SHORT_SESSION_MS; // sign-ins from before this rule keep their own 12-hour expiry
}
