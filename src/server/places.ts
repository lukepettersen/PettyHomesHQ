import "server-only";

// Address lookup (Google Places API, New). Off until GOOGLE_MAPS_API_KEY is set in Railway; the key stays on the
// server (the browser asks HQ, HQ asks Google). A session token per address box keeps Google's billing per lookup.
const key = () => process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
const BASE = () => process.env.PLACES_API_BASE ?? "https://places.googleapis.com";
export const placesOn = () => !!key();

export type Suggestion = { id: string; text: string };

export async function suggestAddresses(input: string, session: string): Promise<Suggestion[]> {
  if (!key() || input.trim().length < 3) return [];
  const r = await fetch(`${BASE()}/v1/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify({ input: input.trim().slice(0, 200), sessionToken: session, includedRegionCodes: ["us"], includedPrimaryTypes: ["street_address", "premise", "subpremise"],
      // Twin Cities first.
      locationBias: { circle: { center: { latitude: 44.9778, longitude: -93.265 }, radius: 50000 } } }),
    signal: AbortSignal.timeout(8000), cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) { if (r) console.error("Address lookup failed", r.status); return []; }
  const j = (await r.json().catch(() => ({}))) as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[] };
  return (j.suggestions ?? []).flatMap((s) => (s.placePrediction ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text?.text ?? "" }] : [])).slice(0, 6);
}

/** "6312 Limerick Ln, Edina, MN 55439" for a picked suggestion. */
export async function addressDetails(id: string, session: string): Promise<string | null> {
  if (!key() || !/^[\w-]{10,300}$/.test(id)) return null;
  const r = await fetch(`${BASE()}/v1/places/${encodeURIComponent(id)}?sessionToken=${encodeURIComponent(session)}`, {
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": "formattedAddress" }, signal: AbortSignal.timeout(8000), cache: "no-store",
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => ({}))) as { formattedAddress?: string };
  return j.formattedAddress ? j.formattedAddress.replace(/, USA$/, "") : null;
}
