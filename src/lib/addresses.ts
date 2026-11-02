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

/**
 * Splits an address into the parts a direct-mail list needs (owner request 2026-11-02):
 * "2215 Hillside Ave, Apt 4, Edina, MN 55436, USA" → street "2215 Hillside Ave, Apt 4", city "Edina", state "MN", zip "55436".
 * When it can't tell (no commas, no state), everything stays in street so nothing is lost.
 */
export function splitAddress(raw: string | null | undefined): { street: string; city: string; state: string; zip: string } {
  const parts = (raw ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa|us|united states( of america)?)$/i.test(parts[parts.length - 1])) parts.pop();
  const empty = { street: parts.join(", "), city: "", state: "", zip: "" };
  if (parts.length < 2) return empty;
  let last = parts[parts.length - 1];
  // "Edina MN 55436" with no comma before the state: split the city off the end.
  const m = last.match(/^(?:(.*?)\s+)?([A-Za-z]{2})\.?(?:\s+(\d{5}(?:-\d{4})?))?$/);
  if (!m) {
    const zipOnly = last.match(/^(\d{5}(?:-\d{4})?)$/);
    if (zipOnly && parts.length >= 3) { parts.pop(); last = parts[parts.length - 1]; const s = last.match(/^([A-Za-z]{2})$/); if (s) return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state: s[1].toUpperCase(), zip: zipOnly[1] }; }
    return empty;
  }
  const [, cityInLast, state, zip = ""] = m;
  if (cityInLast) return { street: parts.slice(0, -1).join(", "), city: cityInLast, state: state.toUpperCase(), zip };
  if (parts.length < 3) return empty;
  return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state: state.toUpperCase(), zip };
}
