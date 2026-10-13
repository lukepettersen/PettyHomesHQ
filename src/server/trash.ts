import "server-only";
import { db } from "@/server/db";
import { removeFile, storageConnected } from "@/server/storage";

export const TRASH_DAYS = 30;

/** Removes stored files from the bucket, then their rows. Files stay put if storage isn't connected. */
async function purgeDocuments(where: { id?: { in: string[] }; deletedAt?: { lt: Date }; personId?: { in: string[] } }) {
  const docs = await db.document.findMany({ where, select: { id: true, key: true } });
  if (!docs.length) return 0;
  if (!storageConnected()) return 0;
  const gone: string[] = [];
  for (const d of docs) {
    try { await removeFile(d.key); gone.push(d.id); } catch (e) { console.error("File storage: delete failed", e instanceof Error ? e.name : "unknown"); }
  }
  await db.document.deleteMany({ where: { id: { in: gone } } });
  return gone.length;
}

/**
 * Permanently removes people, files, tasks and documents that have been in Trash longer than 30 days
 * (a person's notes, tasks, dates and documents go with them).
 */
export async function purgeTrash(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86400000);
  const doomed = (await db.person.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } })).map((p) => p.id);
  const d = (await purgeDocuments({ deletedAt: { lt: cutoff } })) + (await purgeDocuments({ personId: { in: doomed } }));
  // A person whose stored files couldn't be removed yet waits for the next run, so nothing is left behind in the bucket.
  const r = await db.person.deleteMany({ where: { id: { in: doomed }, documents: { none: {} } } });
  const t = await db.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  const f = await db.clientFile.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  return r.count + t.count + f.count + d;
}

/** "Delete forever" from Trash for one document. */
export async function deleteDocumentForever(id: string) {
  const doc = await db.document.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!doc) return null;
  if (storageConnected()) await removeFile(doc.key);
  await db.document.delete({ where: { id } });
  return doc;
}
