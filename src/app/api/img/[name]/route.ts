import { getFile, storageConnected } from "@/server/storage";
import { EMAIL_IMAGE_PREFIX, emailImageName } from "@/lib/emailImages";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/**
 * An image in an email (no sign-in: the people who get the email have to see it). Only images uploaded for emails,
 * under long random names, are served from here, never client files.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (!emailImageName(name) || !storageConnected()) return new Response("Not found", { status: 404 });
  try {
    const body = await getFile(`${EMAIL_IMAGE_PREFIX}${name}`);
    return new Response(new Uint8Array(body), { headers: { "Content-Type": TYPES[name.split(".").pop()!], "Cache-Control": "public, max-age=31536000, immutable", "Content-Length": String(body.length) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
