import "server-only";
import { db } from "@/server/db";
import { cleanKinds, DEFAULT_EMAIL_KINDS } from "@/lib/bulkEmail";

/** Kinds of mass email people can unsubscribe from one at a time (owner request 2026-11-02). AppSetting "email.kinds". */
export const EMAIL_KINDS_KEY = "email.kinds";
export async function loadEmailKinds(): Promise<string[]> {
  const row = await db.appSetting.findUnique({ where: { key: EMAIL_KINDS_KEY } });
  const list = row ? cleanKinds(row.value) : [];
  return list.length ? list : DEFAULT_EMAIL_KINDS;
}
