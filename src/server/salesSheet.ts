import "server-only";
import { db } from "@/server/db";
import { calendarConnection, hasScope, sharedGoogle, SHEETS_SCOPE } from "@/server/google";
import { isoFromDate } from "@/lib/normalize";
import { buildRow, changedCells, colLetter, findRow, type SheetDeal, type SheetShape } from "@/lib/salesSheet";

// The owner's sales Google Sheet (owner request 2026-10-28). Off until a tab is picked in Admin → Integrations and
// Google is connected with Sheets allowed. Never blocks saving a contract: problems are noted for Admin.
export const SHEET_KEY = "sheets.sales"; // { link, id, gid, last?: string }
const ADDED_KEY = "sheets.sales.added"; // contract ids already given a row
type Saved = { link: string; id: string; gid: number; last?: string };
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export async function salesSheet(): Promise<Saved | null> {
  const v = (await db.appSetting.findUnique({ where: { key: SHEET_KEY } }))?.value as Saved | null;
  return v?.id ? v : null;
}
async function note(last: string) {
  const s = await salesSheet();
  if (s) await db.appSetting.update({ where: { key: SHEET_KEY }, data: { value: { ...s, last: `${new Date().toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${last}` } } });
}
async function call(url: string, init?: RequestInit) {
  const r = await sharedGoogle(url, init);
  if (!r) throw new Error("Google isn't connected");
  if (!r.ok) {
    const e = ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? String(r.status);
    throw new Error(/insufficient|scope/i.test(e) ? "Reconnect Google in Admin → Integrations to allow Sheets" : `Google Sheets said: ${e.slice(0, 160)}`);
  }
  return r.json() as Promise<Record<string, unknown>>;
}

type Cell = { formattedValue?: string; userEnteredValue?: { formulaValue?: string }; dataValidation?: { condition?: { type?: string; values?: { userEnteredValue?: string }[] } } };
/** The tab's name, headers, which columns are formulas (from the top data row) and each dropdown's choices. */
async function shapeOf(s: Saved): Promise<{ title: string; sheetId: number; shape: SheetShape; width: number }> {
  const meta = await call(`${API}/${s.id}?fields=sheets.properties(sheetId,title)`) as { sheets?: { properties: { sheetId: number; title: string } }[] };
  const tab = meta.sheets?.find((x) => x.properties.sheetId === s.gid)?.properties ?? meta.sheets?.[0]?.properties;
  if (!tab) throw new Error("That sheet has no tabs");
  const range = encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'!1:2`);
  const grid = await call(`${API}/${s.id}?ranges=${range}&includeGridData=true&fields=sheets.data.rowData.values(formattedValue,userEnteredValue,dataValidation)`) as { sheets?: { data?: { rowData?: { values?: Cell[] }[] }[] }[] };
  const rows = grid.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const head = rows[0]?.values ?? [], top = rows[1]?.values ?? [];
  const formulaCols = new Set<number>(), options: Record<number, string[]> = {};
  top.forEach((c, i) => {
    if (c.userEnteredValue?.formulaValue) formulaCols.add(i);
    if (c.dataValidation?.condition?.type === "ONE_OF_LIST") options[i] = (c.dataValidation.condition.values ?? []).map((v) => v.userEnteredValue ?? "").filter(Boolean);
  });
  return { title: tab.title, sheetId: tab.sheetId, shape: { headers: head.map((c) => c.formattedValue ?? ""), formulaCols, options }, width: Math.max(head.length, top.length) };
}

async function dealOf(paId: string): Promise<SheetDeal | null> {
  const pa = await db.purchaseAgreement.findUnique({ where: { id: paId }, include: { commission: true, file: { include: { person: { include: { source: true } } } } } });
  if (!pa) return null;
  const a = (pa.answers ?? {}) as Record<string, string>;
  return {
    personName: pa.file.person.name, address: pa.address, closing: pa.closing ? isoFromDate(pa.closing) : null, side: pa.side === "seller" ? "seller" : "buyer",
    price: pa.price, sc: a.sc ?? "", lenderName: a.lenderName ?? a.lenderCompany ?? "", financing: a.fin ?? "", referredBy: pa.file.person.referredBy ?? "",
    listPrice: pa.side === "seller" ? pa.file.price ?? null : null, commission: pa.commission?.commission ?? null, source: pa.file.person.source?.name ?? "",
  };
}

/**
 * added: a new row under the headers (formulas, colors and dropdowns copied from the row below, then HQ's values).
 * changed: close date and sale price updated on its row. ended (fell through / deleted): its row is removed.
 */
export async function syncSalesRow(paId: string, event: "added" | "changed" | "ended") {
  try {
    const s = await salesSheet();
    if (!s || !hasScope(await calendarConnection(), SHEETS_SCOPE)) return;
    const d = await dealOf(paId);
    if (!d) return;
    const added = new Set(((await db.appSetting.findUnique({ where: { key: ADDED_KEY } }))?.value as string[] | null) ?? []);
    if (event === "added" && added.has(paId)) return;
    if (event !== "added" && !added.has(paId)) return;
    const { title, sheetId, shape, width } = await shapeOf(s);
    const tab = `'${title.replace(/'/g, "''")}'`;
    if (event === "added") {
      const row = { sheetId, startColumnIndex: 0, endColumnIndex: width };
      await call(`${API}/${s.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [
        { insertDimension: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, inheritFromBefore: false } },
        { copyPaste: { source: { ...row, startRowIndex: 2, endRowIndex: 3 }, destination: { ...row, startRowIndex: 1, endRowIndex: 2 }, pasteType: "PASTE_FORMAT" } },
        { copyPaste: { source: { ...row, startRowIndex: 2, endRowIndex: 3 }, destination: { ...row, startRowIndex: 1, endRowIndex: 2 }, pasteType: "PASTE_DATA_VALIDATION" } },
        ...[...shape.formulaCols].map((c) => ({ copyPaste: { source: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: c, endColumnIndex: c + 1 }, destination: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: c, endColumnIndex: c + 1 }, pasteType: "PASTE_FORMULA" } })),
      ] }) });
      const cells = buildRow(shape, d);
      if (cells.size) await call(`${API}/${s.id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: [...cells].map(([c, v]) => ({ range: `${tab}!${colLetter(c)}2`, values: [[v]] })) }) });
      await db.appSetting.upsert({ where: { key: ADDED_KEY }, update: { value: [...added, paId] }, create: { key: ADDED_KEY, value: [paId] } });
      await note(`Added ${d.address.split(",")[0]}`);
      return;
    }
    const values = await call(`${API}/${s.id}/values/${encodeURIComponent(`${tab}!A1:${colLetter(Math.max(width - 1, 1))}`)}`) as { values?: string[][] };
    const at = findRow(values.values ?? [], d, shape);
    if (at === null) return; // already removed or renamed by hand: leave the sheet alone
    if (event === "changed") {
      const cells = changedCells(shape, d);
      await call(`${API}/${s.id}/values:batchUpdate`, { method: "POST", body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: [...cells].map(([c, v]) => ({ range: `${tab}!${colLetter(c)}${at + 1}`, values: [[v]] })) }) });
      await note(`Updated ${d.address.split(",")[0]}`);
    } else {
      await call(`${API}/${s.id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: at, endIndex: at + 1 } } }] }) });
      await db.appSetting.update({ where: { key: ADDED_KEY }, data: { value: [...added].filter((x) => x !== paId) } });
      await note(`Removed ${d.address.split(",")[0]} (fell through)`);
    }
  } catch (e) {
    const why = e instanceof Error ? e.message : "unknown";
    console.error("Sales sheet:", why);
    await note(`Problem: ${why}`).catch(() => null);
  }
}
