import "server-only";

// Address lookup (Google Places API, New). Off until GOOGLE_MAPS_API_KEY is set in Railway; the key stays on the
// server (the browser asks HQ, HQ asks Google). A session token per address box keeps Google's billing per lookup.
const key = () => process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
const BASE = () => process.env.PLACES_API_BASE ?? "https://places.googleapis.com";
export const placesOn = () => !!key();

export type Suggestion = { id: string; text: string };

/** Suggestions, or Google's reason for saying no (shown under the box so a setup problem is easy to fix). */
export async function suggestAddresses(input: string, session: string): Promise<{ results: Suggestion[]; problem?: string }> {
  if (!key() || input.trim().length < 3) return { results: [] };
  const r = await fetch(`${BASE()}/v1/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify({ input: input.trim().slice(0, 200), sessionToken: session, includedRegionCodes: ["us"],
      // Twin Cities first.
      locationBias: { circle: { center: { latitude: 44.9778, longitude: -93.265 }, radius: 50000 } } }),
    signal: AbortSignal.timeout(8000), cache: "no-store",
  }).catch(() => null);
  if (!r) return { results: [], problem: "Couldn't reach Google. Try again in a minute." };
  if (!r.ok) {
    const e = ((await r.json().catch(() => ({}))) as { error?: { message?: string; status?: string } }).error;
    console.error("Address lookup failed", r.status, e?.status ?? "");
    return { results: [], problem: plainProblem(r.status, e?.message ?? "") };
  }
  const j = (await r.json().catch(() => ({}))) as { suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[] };
  return { results: (j.suggestions ?? []).flatMap((s) => (s.placePrediction ? [{ id: s.placePrediction.placeId, text: s.placePrediction.text?.text ?? "" }] : [])).slice(0, 6) };
}

/** Google's refusal in plain words for the Admin setting it up. */
export function plainProblem(status: number, message: string): string {
  if (/API key not valid|API_KEY_INVALID/i.test(message)) return "Google says the key isn't valid. Check GOOGLE_MAPS_API_KEY in Railway (no spaces).";
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) return "Places API (New) isn't turned on for this key's project. Enable it in Google Cloud → APIs & Services → Library.";
  if (/billing/i.test(message)) return "Google needs billing turned on for this project (Google Cloud → Billing).";
  if (/referer|not authorized|API_KEY_.*BLOCKED|restricted/i.test(message)) return "The key's restrictions block HQ. In Google Cloud → Credentials, set Application restrictions to None and allow Places API (New).";
  return `Google said no (${status})${message ? `: ${message.slice(0, 160)}` : ""}.`;
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
