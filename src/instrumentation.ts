// Runs once when the HQ server starts. Starts a one-minute timer that sends scheduled texts (owner request 2026-10-28)
// by calling the app's own cron route, so it works without a separate worker service.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.NEXTAUTH_SECRET) return;
  // Same key as cronKey() in src/server/scheduledTexts.ts (sha256 of "cron:" + NEXTAUTH_SECRET), via Web Crypto.
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cron:${process.env.NEXTAUTH_SECRET}`));
  const key = Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, "0")).join("");
  const url = `http://127.0.0.1:${process.env.PORT ?? "3000"}/api/cron/scheduled-texts`;
  const tick = () => { fetch(url, { method: "POST", headers: { "x-cron-key": key } }).catch(() => { /* server still starting; next minute */ }); };
  setTimeout(tick, 20_000);
  setInterval(tick, 60_000);
}
