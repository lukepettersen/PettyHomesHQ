import { adminGate } from "../gate";
import { db } from "@/server/db";
import { NAV_KEY, navOrder } from "@/lib/nav";
import { TopBarClient } from "./TopBarClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const saved = await db.appSetting.findUnique({ where: { key: NAV_KEY } });
  return (
    <>
      <h1 className="text-2xl font-extrabold">Top bar</h1>
      <p className="mb-4 mt-1 text-sm muted">The order of the tabs at the top of every page, for everyone. Whiteboard only shows for you.</p>
      <TopBarClient order={navOrder(saved?.value)} />
    </>
  );
}
