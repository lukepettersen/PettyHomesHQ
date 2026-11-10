import "server-only";
import { z } from "zod";
import { UserError } from "@/server/safe";
import { getFile, storageConnected } from "@/server/storage";
import type { Attachment } from "@/lib/email";

// Email attachments (owner request 2026-10-21): uploaded once to the private file storage, then attached to each
// email when it's sent. Gmail allows about 25 MB of attachments per email.
export const ATTACH_PREFIX = "email-attachments/";
// Gmail allows 25 MB of attachments; HQ allows 24 MB (owner request 2026-11-10, up from 20) so the whole email, which
// grows about a third when files are attached, stays under Gmail's 35 MB send limit.
export const MAX_ATTACH_MB = 24;
export const MAX_ATTACH_TOTAL = MAX_ATTACH_MB * 1024 * 1024;

export const attachmentList = z.array(z.object({
  key: z.string().max(300).refine((k) => k.startsWith(ATTACH_PREFIX) && !k.includes(".."), "That attachment isn't valid."),
  name: z.string().trim().min(1).max(160), type: z.string().max(120), size: z.number().int().min(1),
})).max(5, "Up to 5 attachments.").optional();

export async function loadAttachments(list: z.infer<typeof attachmentList>): Promise<Attachment[]> {
  if (!list?.length) return [];
  if (!storageConnected()) throw new UserError("File storage isn't connected, so attachments can't be sent.");
  if (list.reduce((n, a) => n + a.size, 0) > MAX_ATTACH_TOTAL) throw new UserError(`Attachments can be up to ${MAX_ATTACH_MB} MB in total (Gmail's limit is 25 MB). Shrink a big PDF first, or send the files in two emails.`);
  try {
    return await Promise.all(list.map(async (a) => ({ name: a.name, type: a.type || "application/octet-stream", data: await getFile(a.key) })));
  } catch {
    throw new UserError("An attachment couldn't be loaded. Remove it and add it again.");
  }
}
