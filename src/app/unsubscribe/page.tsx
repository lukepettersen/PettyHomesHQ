import { db } from "@/server/db";
import { loadEmailKinds } from "@/server/emailKinds";
import { kindTag, NO_EMAIL_TAGS, validUnsub } from "@/lib/bulkEmail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe · Petty Homes" };

/** Public page behind the unsubscribe link in mass emails (no sign-in). People pick which kinds of email they don't
 *  want, or all of them (owner request 2026-11-02); the kind of the email they came from is ticked to start. */
export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string; t?: string; k?: string; done?: string; bad?: string }> }) {
  const sp = await searchParams;
  const ok = !!sp.p && !!sp.t && validUnsub(sp.p, sp.t, process.env.NEXTAUTH_SECRET ?? "");
  const [kinds, person] = ok && !sp.done ? await Promise.all([
    loadEmailKinds(),
    db.person.findFirst({ where: { id: sp.p }, select: { tags: { select: { tag: { select: { name: true } } } } } }),
  ]) : [[], null];
  const tags = new Set(person?.tags.map((t) => t.tag.name) ?? []);
  const allOff = [...tags].some((t) => NO_EMAIL_TAGS.includes(t));
  const from = kinds.find((k) => k.toLowerCase() === (sp.k ?? "").toLowerCase());
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-center text-2xl font-extrabold">Petty Homes</h1>
      {sp.done ? <p className="text-center">{sp.done === "all" ? "You're unsubscribed from all emails from Petty Homes." : "Got it. You won't get the emails you picked anymore."}</p>
        : sp.bad || !ok ? <p className="text-center">This unsubscribe link didn&apos;t work. Reply to the email and ask to be removed, and we&apos;ll take care of it.</p>
        : allOff ? <p className="text-center">You&apos;re already unsubscribed from all emails from Petty Homes.</p>
        : (
          <form method="post" action="/api/unsubscribe" className="flex flex-col gap-3">
            <p>Which emails don&apos;t you want anymore?</p>
            <input type="hidden" name="p" value={sp.p} /><input type="hidden" name="t" value={sp.t} />
            <fieldset className="flex flex-col gap-2 rounded-xl border border-misty bg-white p-4">
              <legend className="sr-only">Kinds of email</legend>
              {kinds.map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" name="kind" value={k} defaultChecked={k === from || tags.has(kindTag(k))} />
                  {k}{tags.has(kindTag(k)) && <span className="text-xs muted">(already unsubscribed)</span>}
                </label>
              ))}
              <label className="mt-1 flex items-center gap-2 border-t border-misty pt-3 font-semibold">
                <input type="checkbox" name="all" value="1" defaultChecked={!from} />All emails from Petty Homes
              </label>
            </fieldset>
            <button type="submit" className="btn btn-primary self-center">Unsubscribe</button>
          </form>
        )}
    </main>
  );
}
