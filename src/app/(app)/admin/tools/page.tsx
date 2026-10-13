import { adminGate } from "../gate";
import { db } from "@/server/db";
import { ToolsClient } from "./ToolsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const tools = await db.toolLink.findMany({ orderBy: { position: "asc" } });
  return (
    <>
      <h1 className="text-2xl font-extrabold">Tools menu</h1>
      <p className="mb-4 mt-1 text-sm muted">Links in the Tools ▾ menu at the top of every page. They open in a new tab.</p>
      <ToolsClient tools={tools.map((t) => ({ name: t.name, url: t.url }))} />
    </>
  );
}
