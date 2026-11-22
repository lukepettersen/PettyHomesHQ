import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { backfillSales, loadDashboard, loadSaleColumns, loadSales, todayIso } from "@/server/sales";
import { SalesApp } from "./SalesApp";

export const dynamic = "force-dynamic";

/** Sales (owner request 2026-11-22; SPEC.md §7.6): the owner's master file in HQ. Owner only: anyone else gets "not found". */
export default async function Page() {
  const user = await requireUser();
  if (!user.isOwner) notFound();
  await backfillSales(user);
  return <SalesApp rows={await loadSales(user)} today={todayIso()} columns={await loadSaleColumns(user)} cards={await loadDashboard(user)} />;
}
