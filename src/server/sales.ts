import "server-only";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { logActivity } from "@/server/activity";
import { UserError } from "@/server/safe";
import { dateFromIso, formatPhone, isoFromDate, todayCentral } from "@/lib/normalize";
import {
  clientNameOf, commissionPctOf, contactNameFor, importKeyOf, streetOf, lenderLabel, matchSale, moneyFor, readSalesCsv, sourceLabel,
  type ImportRow, type MatchPerson, type StatSale,
} from "@/lib/sales";

// Sales (owner request 2026-11-22; SPEC.md §7.9). OWNER ONLY: every function here that reads or writes a sale's money,
// or lists sales, starts with ownerOnly(user). The one exception is loadPersonSales, which never selects SaleMoney:
// it's the Past Sales card on a contact (address, date, side, status), shown to everyone.

export type SalesUser = { id: string; isOwner: boolean };
/** Throws unless it's the owner. Checked on the server for every sales read and write (not just hidden in the UI). */
export function ownerOnly(user: SalesUser | null | undefined): asserts user is SalesUser {
  if (!user?.isOwner) throw new UserError("Only the owner can see sales.");
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});

// ---------- A contact's Past Sales card (everyone; no money) ----------

/** Deals with the owner: address, date, side, status. Never money (no SaleMoney in the select). */
export async function loadPersonSales(personId: string) {
  const rows = await db.sale.findMany({
    where: { deletedAt: null, status: { not: "fell_through" }, people: { some: { personId } } },
    orderBy: [{ closeDate: { sort: "desc", nulls: "first" } }],
    select: { id: true, address: true, city: true, closeDate: true, side: true, status: true },
  });
  return rows.map((r) => ({ id: r.id, address: [r.address, r.city].filter(Boolean).join(", "), date: r.closeDate ? isoFromDate(r.closeDate) : null, side: r.side, status: r.status }));
}

// ---------- The owner's Sales tab ----------

export async function loadSales(user: SalesUser) {
  ownerOnly(user);
  const rows = await db.sale.findMany({ where: { deletedAt: null }, orderBy: [{ closeDate: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    include: { money: true, people: { include: { person: { select: { id: true, name: true, deletedAt: true } } } } } });
  return rows.map((r) => ({
    id: r.id, paId: r.paId, status: r.status, side: r.side, clientName: r.clientName, address: r.address, city: r.city, zip: r.zip,
    closeDate: r.closeDate ? isoFromDate(r.closeDate) : null, source: r.source, initialSource: r.initialSource, lender: r.lender, referredFrom: r.referredFrom, onTime: r.onTime,
    review: Array.isArray(r.review) ? (r.review as { id: string; name: string; why: string }[]) : null,
    people: r.people.filter((p) => !p.person.deletedAt).map((p) => ({ id: p.person.id, name: p.person.name })),
    price: r.money?.price ?? 0, listPrice: r.money?.listPrice ?? 0, contributions: r.money?.contributions ?? 0, commissionPct: r.money?.commissionPct ?? 0,
    gross: r.money?.gross ?? 0, fees: r.money?.fees ?? 0, net: r.money?.net ?? 0, splitPct: r.money?.splitPct ?? 0, commissionPaid: r.money?.commissionPaid ?? false,
  }));
}
export type SaleView = Awaited<ReturnType<typeof loadSales>>[number];
export const statsOf = (rows: SaleView[]): StatSale[] => rows.map((r) => ({ status: r.status, side: r.side, closeDate: r.closeDate, source: r.source, referredFrom: r.referredFrom, price: r.price, listPrice: r.listPrice, gross: r.gross, net: r.net, commissionPaid: r.commissionPaid }));

export type SaleInput = {
  status: string; side: string; clientName: string; address: string; city: string; zip: string; closeDate: string | null; source: string; initialSource: string; lender: string;
  referredFrom: string; onTime: string; price: number; listPrice: number; contributions: number; commissionPct: number; gross: number; fees: number; net: number; splitPct: number;
  commissionPaid: boolean; personIds: string[];
};
const saleData = (v: SaleInput) => ({ status: v.status, side: v.side, clientName: v.clientName.trim().slice(0, 120), address: v.address.trim().slice(0, 200), city: v.city.trim().slice(0, 80),
  zip: v.zip.trim().slice(0, 10), closeDate: v.closeDate ? dateFromIso(v.closeDate) : null, source: v.source.trim().slice(0, 60), initialSource: v.initialSource.trim().slice(0, 60),
  lender: v.lender.trim().slice(0, 80), referredFrom: v.referredFrom.trim().slice(0, 120), onTime: v.onTime });
const moneyData = (v: SaleInput) => ({ price: Math.round(v.price), listPrice: Math.round(v.listPrice), contributions: Math.round(v.contributions), commissionPct: v.commissionPct,
  gross: v.gross, fees: v.fees, net: v.net, splitPct: v.splitPct, commissionPaid: v.commissionPaid });

export async function saveSale(user: SalesUser, id: string | null, v: SaleInput) {
  ownerOnly(user);
  if (!v.address.trim()) throw new UserError("Add the property address.");
  if (v.status === "closed" && !v.closeDate) throw new UserError("A closed sale needs its close date.");
  const people = await db.person.findMany({ where: { id: { in: v.personIds }, deletedAt: null }, select: { id: true } });
  const saved = await db.$transaction(async (tx) => {
    // Picking contacts in the editor settles a review.
    const s = id ? await tx.sale.update({ where: { id, deletedAt: null }, data: { ...saleData(v), ...(people.length ? { review: Prisma.DbNull } : {}) } }) : await tx.sale.create({ data: saleData(v) });
    await tx.saleMoney.upsert({ where: { saleId: s.id }, update: moneyData(v), create: { saleId: s.id, ...moneyData(v) } });
    await tx.salePerson.deleteMany({ where: { saleId: s.id } });
    for (const p of people) await tx.salePerson.create({ data: { saleId: s.id, personId: p.id } });
    return s;
  });
  await logActivity(user.id, id ? "update" : "create", "sale", saved.id, `${id ? "Edited" : "Added"} sale ${saved.address} (${saved.side}, ${saved.status})`);
  for (const p of people) revalidatePath(`/people/${p.id}`);
  return saved.id;
}

export async function deleteSale(user: SalesUser, id: string) {
  ownerOnly(user);
  const s = await db.sale.update({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  await logActivity(user.id, "delete", "sale", id, `Removed sale ${s.address} (${s.side})`);
}

/** Review list: link the sale to a contact, make a new contact for it, or leave it with nobody. */
export async function resolveReview(user: SalesUser, saleId: string, how: { personId: string } | { create: true } | { none: true }) {
  ownerOnly(user);
  const s = await db.sale.findFirst({ where: { id: saleId, deletedAt: null } });
  if (!s) throw new UserError("That sale was removed.");
  let personId: string | null = null;
  if ("personId" in how) {
    const p = await db.person.findFirst({ where: { id: how.personId, deletedAt: null }, select: { id: true } });
    if (!p) throw new UserError("That contact was removed.");
    personId = p.id;
  } else if ("create" in how) personId = await newContactFor(user.id, s);
  if (personId) await db.salePerson.upsert({ where: { saleId_personId: { saleId: s.id, personId } }, update: {}, create: { saleId: s.id, personId } });
  await db.sale.update({ where: { id: s.id }, data: { review: Prisma.DbNull } });
  await logActivity(user.id, "update", "sale", s.id, `Review: ${s.address} ${"none" in how ? "left with no contact" : "linked to a contact"}`);
  if (personId) revalidatePath(`/people/${personId}`);
}

/** A new contact for a past sale nobody in HQ matched: the master file's name, the sale's address, stage Past Client. */
async function newContactFor(userId: string, s: { clientName: string; address: string; city: string; zip: string; side: string }) {
  const stage = await db.stage.findFirst({ where: { name: { equals: "Past Client", mode: "insensitive" } }, select: { id: true } });
  const full = [s.address, s.city, s.zip ? `MN ${s.zip}` : ""].filter(Boolean).join(", ");
  const name = contactNameFor(s.clientName);
  const p = await db.person.create({ data: { name, mailingName: name, stageId: stage?.id ?? null, createdById: userId,
    ...(s.side === "buyer" ? { address: full, addresses: { create: { label: "Home", value: full, mailing: true } } } : {}) } });
  return p.id;
}

// ---------- Importing the master file ----------

async function matchPeople(): Promise<MatchPerson[]> {
  const people = await db.person.findMany({ where: { deletedAt: null }, select: { id: true, name: true, address: true, addresses: { select: { value: true } }, stage: { select: { name: true } }, tags: { select: { tag: { select: { name: true } } } } } });
  return people.map((p) => ({ id: p.id, name: p.name, addresses: [...(p.address ? [p.address] : []), ...p.addresses.map((a) => a.value)],
    pastClient: /past client/i.test(p.stage?.name ?? "") || p.tags.some((t) => /past client/i.test(t.tag.name)) }));
}

export type ImportPreview = { rows: (ImportRow & { match: "sure" | "review" | "new" | "update"; who: string })[]; skipped: number };
/** What an import would do with each row: link to a contact (sure), ask the owner (review), make a contact (new), or update a sale already here. */
export async function previewSalesImport(user: SalesUser, csv: string): Promise<ImportPreview> {
  ownerOnly(user);
  const { rows, problem, skipped } = readSalesCsv(csv);
  if (problem) throw new UserError(problem);
  const people = await matchPeople();
  const name = new Map(people.map((p) => [p.id, p.name]));
  const known = new Set((await db.sale.findMany({ where: { importKey: { in: rows.map((r) => importKeyOf(r.closeDate, r.side, r.address)) } }, select: { importKey: true } })).map((s) => s.importKey));
  return { skipped, rows: rows.map((r) => {
    if (known.has(importKeyOf(r.closeDate, r.side, r.address))) return { ...r, match: "update" as const, who: "already in HQ: updated" };
    const m = matchSale(r, people);
    return m.sure.length ? { ...r, match: "sure" as const, who: m.sure.map((id) => name.get(id)).join(", ") }
      : m.maybe.length ? { ...r, match: "review" as const, who: m.maybe.map((x) => x.name).join(" / ") } : { ...r, match: "new" as const, who: contactNameFor(r.clientName) };
  }) };
}

/**
 * Saves the master file's sales. A row already imported (same close date and street) is updated; a sale HQ made from a
 * purchase agreement for the same street within 45 days of the close date takes the file's numbers. Contacts: a sure
 * match is linked, nobody found makes a new contact, and anything in between goes to the review list.
 */
export async function applySalesImport(user: SalesUser, csv: string) {
  ownerOnly(user);
  const { rows, problem } = readSalesCsv(csv);
  if (problem) throw new UserError(problem);
  const people = await matchPeople();
  let added = 0, updated = 0, review = 0, created = 0;
  for (const r of rows) {
    const key = importKeyOf(r.closeDate, r.side, r.address);
    const data = { status: r.completed ? "closed" : "pending", side: r.side, clientName: r.clientName, address: r.address, city: r.city, zip: r.zip, closeDate: dateFromIso(r.closeDate),
      source: r.source, initialSource: r.initialSource, lender: r.lender, referredFrom: r.referredFrom, onTime: r.onTime };
    const money = { price: Math.round(r.price), listPrice: Math.round(r.listPrice), contributions: Math.round(r.contributions), commissionPct: r.commissionPct, gross: r.gross,
      fees: r.fees, net: r.net, splitPct: r.splitPct, commissionPaid: r.commissionPaid };
    let sale = await db.sale.findUnique({ where: { importKey: key } });
    if (!sale) {
      // The same deal made from a purchase agreement in HQ: one sale, with the file's numbers.
      const from = new Date(Date.parse(r.closeDate) - 45 * 86400000), to = new Date(Date.parse(r.closeDate) + 45 * 86400000);
      const twin = (await db.sale.findMany({ where: { importKey: null, side: r.side, deletedAt: null, OR: [{ closeDate: { gte: from, lte: to } }, { closeDate: null }] } }))
        .find((x) => streetOf(x.address) === streetOf(r.address));
      if (twin) sale = await db.sale.update({ where: { id: twin.id }, data: { importKey: key } });
    }
    if (sale) {
      await db.sale.update({ where: { id: sale.id }, data: { ...data, deletedAt: null } });
      await db.saleMoney.upsert({ where: { saleId: sale.id }, update: money, create: { saleId: sale.id, ...money } });
      updated++;
      continue;
    }
    const m = matchSale(r, people);
    const s = await db.sale.create({ data: { ...data, importKey: key, ...(m.sure.length || !m.maybe.length ? {} : { review: m.maybe }), money: { create: money } } });
    added++;
    if (m.sure.length) for (const personId of m.sure) await db.salePerson.create({ data: { saleId: s.id, personId } });
    else if (m.maybe.length) review++;
    else {
      const personId = await newContactFor(user.id, r);
      await db.salePerson.create({ data: { saleId: s.id, personId } });
      people.push({ id: personId, name: contactNameFor(r.clientName), addresses: r.side === "buyer" ? [r.address] : [], pastClient: true });
      created++;
    }
  }
  await logActivity(user.id, "create", "sale", null, `Imported the master file: ${added} sales added, ${updated} updated, ${created} new contacts, ${review} to review`);
  revalidatePath("/sales");
  return { added, updated, created, review };
}

// ---------- Sales made from purchase agreements (replaces the owner's Google Sheet sync) ----------

/** The owner's usual split: the newest closed sale's split %, else 100. */
async function usualSplit(): Promise<number> {
  const m = await db.saleMoney.findFirst({ where: { splitPct: { gt: 0 }, sale: { status: "closed", deletedAt: null } }, orderBy: { sale: { closeDate: "desc" } }, select: { splitPct: true } });
  return m?.splitPct ?? 100;
}

/**
 * Keeps a contract's sale in step (called on add, edit, close, fall-through; never blocks saving the contract):
 * pending while active, closed with its close date when it closes, fell through when it falls through. Price,
 * commission %, list price, contributions, lender, source and referral follow the contract; the owner's own edits to
 * the money (gross, net, split, paid) are kept once the sale exists.
 */
export async function syncSaleFromPa(paId: string): Promise<void> {
  try {
    const pa = await db.purchaseAgreement.findUnique({ where: { id: paId }, include: { commission: true, file: { include: { person: { include: { source: true } } } } } });
    if (!pa) return;
    const had = await db.sale.findUnique({ where: { paId: pa.id }, include: { money: true } });
    if (pa.deletedAt || pa.file.deletedAt) { if (had) await db.sale.update({ where: { id: had.id }, data: { deletedAt: new Date() } }); return; }
    const a = obj(pa.answers);
    const parts = pa.address.split(",").map((x) => x.trim());
    const zip = /\b(\d{5})\b/.exec(parts.slice(1).join(" "))?.[1] ?? "";
    const status = pa.state === "closed" ? "closed" : pa.state === "fell_through" ? "fell_through" : "pending";
    const data = { paId: pa.id, status, side: pa.side === "seller" ? "seller" : "buyer", clientName: clientNameOf(pa.file.person.name), address: parts[0] ?? pa.address,
      city: parts.length > 2 ? parts[1] : "", zip, closeDate: pa.closing, lender: lenderLabel(pa.side, a.fin ?? "", a.lenderName ?? a.lenderCompany ?? ""),
      source: had?.source || sourceLabel(pa.file.person.source?.name ?? ""), referredFrom: had?.referredFrom || (pa.file.person.referredBy ?? "") };
    const pct = commissionPctOf(pa.commission?.commission, pa.price);
    const listPrice = pa.side === "seller" ? pa.file.price ?? 0 : 0;
    const sc = a.sc ?? "";
    const contributions = /%\s*$/.test(sc) ? Math.round((pa.price * Number(sc.replace(/[%\s]/g, ""))) / 100) : Number(sc.replace(/[$,\s]/g, "")) || 0;
    if (!had) {
      const split = await usualSplit();
      const { gross, net } = moneyFor(pa.price, pct, split);
      const s = await db.sale.create({ data: { ...data, money: { create: { price: pa.price, listPrice, contributions, commissionPct: pct, gross, net, splitPct: split, commissionPaid: false } } } });
      await db.salePerson.create({ data: { saleId: s.id, personId: pa.file.personId } });
      return;
    }
    await db.sale.update({ where: { id: had.id }, data: { ...data, deletedAt: null } });
    // Price or commission % changed on the contract: gross and net follow (at the sale's split).
    const m = had.money;
    if (!m) { await db.saleMoney.create({ data: { saleId: had.id, price: pa.price, listPrice, contributions, commissionPct: pct, ...moneyFor(pa.price, pct, await usualSplit()), splitPct: await usualSplit() } }); return; }
    if (m.price !== pa.price || m.commissionPct !== pct) {
      const { gross, net } = moneyFor(pa.price, pct, m.splitPct || (await usualSplit()));
      await db.saleMoney.update({ where: { saleId: had.id }, data: { price: pa.price, commissionPct: pct, gross, net, listPrice: listPrice || m.listPrice, contributions } });
    } else if (listPrice && listPrice !== m.listPrice) await db.saleMoney.update({ where: { saleId: had.id }, data: { listPrice } });
    await db.salePerson.upsert({ where: { saleId_personId: { saleId: had.id, personId: pa.file.personId } }, update: {}, create: { saleId: had.id, personId: pa.file.personId } });
  } catch (e) {
    console.error("Sales: couldn't update the sale for a contract:", e instanceof Error ? e.name : "error");
  }
}

/** Once: a sale for every contract already in HQ (active or closed), so the dashboard starts complete. */
export async function backfillSales(user: SalesUser) {
  ownerOnly(user);
  if (await db.appSetting.findUnique({ where: { key: "sales.backfilled" } })) return 0;
  const created = await db.appSetting.create({ data: { key: "sales.backfilled", value: new Date().toISOString() } }).then(() => true, () => false);
  if (!created) return 0;
  const pas = await db.purchaseAgreement.findMany({ where: { deletedAt: null, state: { in: ["active", "closed"] }, file: { deletedAt: null } }, select: { id: true } });
  for (const p of pas) await syncSaleFromPa(p.id);
  return pas.length;
}

/** Who can be linked to a sale (the owner's sale editor): contacts by name, phone shown. */
export async function salePeopleOptions(user: SalesUser, q: string) {
  ownerOnly(user);
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return [];
  const rows = await db.person.findMany({ where: { deletedAt: null, AND: words.map((w) => ({ name: { contains: w, mode: "insensitive" as const } })) }, take: 8, orderBy: { name: "asc" },
    select: { id: true, name: true, phones: { take: 1, orderBy: { position: "asc" }, select: { number: true } } } });
  return rows.map((p) => ({ id: p.id, name: p.name, detail: p.phones[0] ? formatPhone(p.phones[0].number) : "" }));
}

export const todayIso = () => isoFromDate(todayCentral());
