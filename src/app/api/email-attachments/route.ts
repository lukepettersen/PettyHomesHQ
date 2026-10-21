import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { putFile, storageConnected } from "@/server/storage";
import { storageProblem, safeName, uploadProblem } from "@/lib/documents";
import { ATTACH_PREFIX, MAX_ATTACH_TOTAL } from "@/server/attachments";

export const dynamic = "force-dynamic";

/** Upload a file to attach to an email (form field: file). Stored privately; the email picks it up when sent. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!storageConnected()) return Response.json({ error: "File storage isn't connected yet (Admin → Integrations), so emails can't have attachments." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Pick a file." }, { status: 400 });
  const name = safeName(file.name);
  const problem = uploadProblem(name, file.size) ?? (file.size > MAX_ATTACH_TOTAL ? `"${name}" is larger than 20 MB, too big to email.` : null);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const key = `${ATTACH_PREFIX}${new Date().toISOString().slice(0, 7)}/${randomBytes(9).toString("base64url")}-${name.replace(/ /g, "_")}`;
  const type = (file.type || "application/octet-stream").slice(0, 120);
  try { await putFile(key, new Uint8Array(await file.arrayBuffer()), type); }
  catch (e) { return Response.json({ error: `The file didn't upload. ${storageProblem(e)}` }, { status: 502 }); }
  return Response.json({ key, name, size: file.size, type });
}
