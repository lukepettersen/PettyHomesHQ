import { adminGate } from "../gate";
import { loadPostTemplates } from "@/server/postTemplates";
import { PostTemplatesClient } from "./PostTemplatesClient";

export const dynamic = "force-dynamic";

/** Admin → Features → Post templates (owner request 2026-11-26): Canva designs that Make post fills in on a deal. */
export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  return (
    <>
      <h1 className="text-2xl font-extrabold">Instagram post templates</h1>
      <p className="mb-4 mt-1 text-sm muted">
        In Canva, delete the house photo and the words that change (beds, city, review…), then <b>Share → Download → PNG</b> with
        <b> Transparent background</b> ticked. Upload it here, then drag the photo box and the text boxes into place. On a deal, <b>Make post</b> fills them in.
      </p>
      <PostTemplatesClient initial={await loadPostTemplates()} />
    </>
  );
}
