// A contact's addresses (owner request 2026-10-27). Pure, tested in addresses.test.ts.

export type AddressRow = { label: string; value: string; mailing: boolean };

/**
 * Drops empty rows and picks the mailing address: the one marked, when there are two or more; with one address
 * it is the mailing address and nothing needs marking. `primary` goes in Person.address.
 */
export function cleanAddresses(rows: AddressRow[]): { rows: (AddressRow & { position: number })[]; primary: string | null } {
  const kept = rows.map((r) => ({ label: r.label.trim().slice(0, 40), value: r.value.trim().slice(0, 300), mailing: r.mailing })).filter((r) => r.value);
  const marked = kept.length > 1 ? Math.max(0, kept.findIndex((r) => r.mailing)) : -1;
  const out = kept.map((r, i) => ({ ...r, mailing: i === marked, position: i }));
  return { rows: out, primary: out.find((r) => r.mailing)?.value ?? out[0]?.value ?? null };
}
