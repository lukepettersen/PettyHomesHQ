// Who may sign in. Pure functions so they can be unit tested.

export function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN || "pettyhomes.com").toLowerCase();
}

/**
 * A Google account may sign in only if its email is on the Workspace domain, Google says the
 * email is verified, and (when Google sends it) the hosted-domain claim matches.
 */
export function isAllowedGoogleAccount(
  profile: { email?: string | null; email_verified?: boolean; hd?: string | null } | undefined,
  domain = allowedDomain(),
): boolean {
  const email = profile?.email?.trim().toLowerCase();
  if (!email || profile?.email_verified !== true) return false;
  const at = email.lastIndexOf("@");
  if (at < 1 || email.slice(at + 1) !== domain) return false;
  if (profile?.hd != null && profile.hd.toLowerCase() !== domain) return false;
  return true;
}
