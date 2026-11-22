import { describe, expect, it, vi } from "vitest";

// Sales are owner-only (owner request 2026-11-22): every sales function must refuse anyone else BEFORE touching the
// database, and the contact page's Past Sales card must never ask for money.
const touched: string[] = [];
const spy = (name: string) => (...args: unknown[]) => { touched.push(name); calls.push([name, args]); return Promise.resolve([]); };
const calls: [string, unknown[]][] = [];
const model = (m: string) => new Proxy({}, { get: (_t, k) => spy(`${m}.${String(k)}`) });
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/activity", () => ({ logActivity: () => Promise.resolve() }));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get: (_t, k) => (k === "$transaction" ? spy("$transaction") : model(String(k))) }) }));

const alyssa = { id: "u-alyssa", isOwner: false };
const sale = { status: "closed", side: "buyer", clientName: "X", address: "1 Main", city: "", zip: "", closeDate: "2026-01-01", source: "", initialSource: "", lender: "", referredFrom: "", onTime: "",
  price: 1, listPrice: 1, contributions: 0, commissionPct: 2.7, gross: 1, fees: 0, net: 1, splitPct: 94, commissionPaid: true, personIds: [] };

describe("sales: only the owner (server-side)", async () => {
  const s = await import("./sales");
  const attempts: [string, () => Promise<unknown>][] = [
    ["loadSales", () => s.loadSales(alyssa)], ["saveSale", () => s.saveSale(alyssa, null, sale)], ["deleteSale", () => s.deleteSale(alyssa, "x")],
    ["resolveReview", () => s.resolveReview(alyssa, "x", { none: true })], ["previewSalesImport", () => s.previewSalesImport(alyssa, "a")], ["applySalesImport", () => s.applySalesImport(alyssa, "a")],
    ["salePeopleOptions", () => s.salePeopleOptions(alyssa, "sam")], ["backfillSales", () => s.backfillSales(alyssa)], ["loadSaleColumns", () => s.loadSaleColumns(alyssa)], ["saveSaleColumns", () => s.saveSaleColumns(alyssa, ["gross"])], ["loadDashboard", () => s.loadDashboard(alyssa)], ["saveDashboard", () => s.saveDashboard(alyssa, [])],
  ];
  for (const [name, run] of attempts) it(`${name} refuses a non-owner without reading anything`, async () => {
    touched.length = 0;
    await expect(run()).rejects.toThrow(/Only the owner/);
    expect(touched).toEqual([]);
  });
  it("refuses no user at all", () => { expect(() => s.ownerOnly(null)).toThrow(); expect(() => s.ownerOnly({ id: "x", isOwner: true })).not.toThrow(); });
  it("the Past Sales card's query selects no money", async () => {
    calls.length = 0;
    await s.loadPersonSales("p1");
    const [name, args] = calls[0];
    expect(name).toBe("sale.findMany");
    const q = args[0] as { select: Record<string, unknown>; include?: unknown };
    expect(q.include).toBeUndefined();
    expect(Object.keys(q.select).sort()).toEqual(["address", "city", "closeDate", "id", "side", "status"]);
  });
});
