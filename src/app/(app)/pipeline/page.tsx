import { requireUser } from "@/server/auth";
import { hasPermission } from "@/server/permissions";
import { loadPipeline, loadStatuses, loadTicker } from "@/server/files";
import { isoFromDate, todayCentral } from "@/lib/normalize";
import { PipelineBoard } from "./PipelineBoard";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const [board, statuses, ticker] = await Promise.all([loadPipeline(user), loadStatuses(), loadTicker(user.id)]);
  const tab = sp.tab === "sellers" || sp.tab === "uc" ? sp.tab : "buyers";
  return <PipelineBoard cards={board.files} contracts={board.contracts} closed={board.closed} statuses={statuses} today={isoFromDate(todayCentral())} initialTab={tab} canEditStages={hasPermission(user.permissions, "manageUsers")} ticker={ticker} />;
}
