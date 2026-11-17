import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { putFile, storageConnected } from "@/server/storage";
import { publicBase } from "@/server/twilio";
import { storageProblem } from "@/lib/documents";
import { EMAIL_IMAGE_TYPES, EMAIL_IMAGE_MAX, EMAIL_IMAGE_PREFIX } from "@/lib/emailImages";

export const dynamic = "force-dynamic";

/** Upload an image for an email or template (banner, logo). Returns the public address the email shows it from. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!storageConnected()) return Response.json({ error: "File storage isn't connected yet (Admin → Integrations), so emails can't have images." }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Pick an image." }, { status: 400 });
  const ext = EMAIL_IMAGE_TYPES[file.type];
  if (!ext) return Response.json({ error: "Use a PNG, JPG, GIF or WebP image." }, { status: 400 });
  if (file.size > EMAIL_IMAGE_MAX) return Response.json({ error: "That image is larger than 5 MB. Use a smaller one so emails load quickly." }, { status: 400 });
  const name = `${randomBytes(18).toString("base64url")}.${ext}`;
  try { await putFile(`${EMAIL_IMAGE_PREFIX}${name}`, new Uint8Array(await file.arrayBuffer()), file.type); }
  catch (e) { return Response.json({ error: `The image didn't upload. ${storageProblem(e)}` }, { status: 502 }); }
  return Response.json({ url: `${publicBase()}/api/img/${name}` });
}
