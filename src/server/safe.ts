import { ZodError } from "zod";
import { requireUser, type SessionUser } from "@/server/auth";
import { hasPermission, type Permission } from "@/server/permissions";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Every server action goes through here: signed-in team member, optional permission check,
 * and errors turned into a plain message instead of a crash.
 */
export async function guarded<T>(perm: Permission | null, fn: (user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  if (perm && !hasPermission(user.permissions, perm)) return { ok: false, error: "You don't have permission to do that." };
  try {
    const data = await fn(user);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the form and try again." };
    if (e instanceof UserError) return { ok: false, error: e.message };
    console.error("Action failed", e instanceof Error ? e.message : "unknown error");
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

/** Throw for problems the user can fix; the message is shown to them. */
export class UserError extends Error {}
