"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/server/safe";
import { applySalesImport, deleteSale, ownerOnly, previewSalesImport, resolveReview, salePeopleOptions, saveSale, saveSaleColumns } from "@/server/sales";

// Sales tab (SPEC.md §7.6): OWNER ONLY. Every action checks it on the server (ownerOnly), whatever the page shows.
const id = z.string().trim().min(1).max(40);
const money = z.number().finite().min(-10_000_000).max(100_000_000);
const sale = z.object({
  status: z.enum(["pending", "closed", "fell_through"]), side: z.enum(["buyer", "seller"]), clientName: z.string().max(120), address: z.string().max(200), city: z.string().max(80),
  zip: z.string().max(10), closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), source: z.string().max(60), initialSource: z.string().max(60), lender: z.string().max(80),
  referredFrom: z.string().max(120), onTime: z.enum(["", "YES", "NO"]), price: money, listPrice: money, contributions: money, commissionPct: z.number().min(0).max(100), gross: money,
  fees: money, net: money, splitPct: z.number().min(0).max(1000), commissionPaid: z.boolean(), personIds: z.array(id).max(10),
});

export async function saveSaleAction(saleId: string | null, input: unknown) {
  return guarded(null, async (user) => { ownerOnly(user); const r = await saveSale(user, saleId ? id.parse(saleId) : null, sale.parse(input)); revalidatePath("/sales"); return r; });
}
export async function deleteSaleAction(saleId: string) {
  return guarded(null, async (user) => { ownerOnly(user); await deleteSale(user, id.parse(saleId)); revalidatePath("/sales"); });
}
export async function resolveReviewAction(saleId: string, input: unknown) {
  return guarded(null, async (user) => {
    ownerOnly(user);
    const v = z.union([z.object({ personId: id }), z.object({ create: z.literal(true) }), z.object({ none: z.literal(true) })]).parse(input);
    await resolveReview(user, id.parse(saleId), v);
    revalidatePath("/sales");
  });
}
export async function previewImportAction(csv: string) {
  return guarded(null, async (user) => { ownerOnly(user); return previewSalesImport(user, z.string().max(2_000_000).parse(csv)); });
}
export async function applyImportAction(csv: string) {
  return guarded(null, async (user) => { ownerOnly(user); const r = await applySalesImport(user, z.string().max(2_000_000).parse(csv)); revalidatePath("/sales"); return r; });
}
export async function findPeopleAction(q: string) {
  return guarded(null, async (user) => { ownerOnly(user); return salePeopleOptions(user, z.string().max(80).parse(q)); });
}
export async function saveColumnsAction(cols: unknown) {
  return guarded(null, async (user) => { ownerOnly(user); await saveSaleColumns(user, z.array(z.string().max(30)).max(40).parse(cols)); revalidatePath("/sales"); });
}
