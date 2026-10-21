import "server-only";
import { z } from "zod";
import { UserError } from "@/server/safe";
import { getFile, storageConnected } from "@/server/storage";
import type { Attachment } from "@/lib/email";

// Email attachments (owner request 2026-10-21): uploaded once to the private file storage, then attached to each
// email when it's sent. Gmail allows about 25 MB of attachments per email.
export const ATTACH_PREFIX = "email-attachments/";
export const MAX_ATTACH_TOTAL = 20 * 1024 * 1024;

export const attachmentList = z.array(z.object({
  key: z.string().max(300).refine((k) => k.startsWith(ATTACH_PREFIX) && !k.includes(".."), "That attachment isn't valid."),
  name: z.string().trim().min(1).max(160), type: z.string().max(120), size: z.number().int().min(1),
})).max(5, "Up to 5 attachments.").optional();

export async function loadAttachments(list: z.infer<typeof attachmentList>): Promise<Attachment[]> {
  if (!list?.length) return [];
  if (!storageConnected()) throw new UserError("File storage isn't connected, so attachments can't be sent.");
  if (list.reduce((n, a) => n + a.size, 0) > MAX_ATTACH_TOTAL) throw new UserError("Attachments can be up to 20 MB in total.");
  try {
    return await Promise.all(list.map(async (a) => ({ name: a.name, type: a.type || "application/octet-stream", data: await getFile(a.key) })));
  } catch {
    throw new UserError("An attachment couldn't be loaded. Remove it and add it again.");
  }
}
