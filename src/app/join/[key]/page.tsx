import type { Metadata } from "next";
import { loadSignup } from "@/server/events";
import { signupState } from "@/lib/events";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

// Never listed by search engines (also sent as an X-Robots-Tag header, next.config.ts).
export const metadata: Metadata = { title: "Sign up · Petty Homes", robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }, referrer: "no-referrer" };

/** An event's private signup page (owner request 2026-11-21; SPEC.md §6.7): only reachable with its long random link. */
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const e = await loadSignup(key);
  const state = e ? signupState(e) : { open: false, why: "This signup page isn't available." };
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <p className="text-center text-sm font-bold tracking-wide text-accent">PETTY HOMES</p>
      {e && <h1 className="mt-1 text-center text-2xl font-extrabold">{e.page.title || e.page.defaults.title}</h1>}
      {!e || !state.open ? <p className="card mt-6 p-5 text-center">{state.why || "This signup page isn't available."}</p> : (
        <>
          {e.intro && <p className="mt-3 whitespace-pre-wrap text-center">{e.intro}</p>}
          <SignupForm signupKey={key} multiSlot={e.multiSlot} fields={e.fields} slots={e.slots} eventName={e.name}
            page={{ gamesOn: e.page.gamesOn, gamesLabel: e.page.gamesLabel || e.page.defaults.gamesLabel, thanks: e.page.thanks || e.page.defaults.thanks, emailRequired: e.page.emailRequired }} />
        </>
      )}
      <p className="mt-6 text-center text-xs muted">Questions? Text Luke at 612-702-0295.</p>
    </main>
  );
}
