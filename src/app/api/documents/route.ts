import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { logActivity } from "@/server/activity";
import { putFile, storageConnected } from "@/server/storage";
import { MAX_BYTES, safeName, uploadProblem } from "@/lib/documents";

export const dynamic = "force-dynamic";

/** Upload one file to a person's Files card (form fields: personId, file). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!storageConnected()) return Response.json({ error: "File storage isn't connected yet (Admin → Integrations)." }, { status: 400 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 1024 * 1024) return Response.json({ error: "Files can be up to 25 MB." }, { status: 413 });
  const form = await req.formData().catch(() => null);
  const personId = String(form?.get("personId") ?? "");
  const file = form?.get("file");
  if (!(file instanceof File) || !personId) return Response.json({ error: "Pick a file to upload." }, { status: 400 });
  const name = safeName(file.name);
  const problem = uploadProblem(name, file.size);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const person = await db.person.findFirst({ where: { id: personId, deletedAt: null }, select: { id: true, name: true } });
  if (!person) return Response.json({ error: "That person was deleted." }, { status: 404 });
  const key = `people/${person.id}/${randomBytes(9).toString("base64url")}-${name.replace(/ /g, "_")}`;
  const contentType = (file.type || "application/octet-stream").slice(0, 120);
  try {
    await putFile(key, new Uint8Array(await file.arrayBuffer()), contentType);
  } catch (e) {
    console.error("File storage: upload failed", e instanceof Error ? e.name : "unknown");
    return Response.json({ error: "The upload didn't go through. Try again, or check File storage in Admin → Integrations." }, { status: 502 });
  }
  const doc = await db.document.create({ data: { personId: person.id, name, size: file.size, contentType, key, uploadedById: user.id } });
  await logActivity(user.id, "create", "document", doc.id, `Uploaded "${name}" for ${person.name}`);
  return Response.json({ id: doc.id, name });
}
