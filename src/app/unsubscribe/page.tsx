import { validUnsub } from "@/lib/bulkEmail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe · Petty Homes" };

/** Public page behind the unsubscribe link in mass emails (no sign-in). */
export default async function Page({ searchParams }: { searchParams: Promise<{ p?: string; t?: string; done?: string; bad?: string }> }) {
  const sp = await searchParams;
  const ok = !!sp.p && !!sp.t && validUnsub(sp.p, sp.t, process.env.NEXTAUTH_SECRET ?? "");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold">Petty Homes</h1>
      {sp.done ? <p>You&apos;re unsubscribed. You won&apos;t get these emails anymore.</p>
        : sp.bad || !ok ? <p>This unsubscribe link didn&apos;t work. Reply to the email and ask to be removed, and we&apos;ll take care of it.</p>
        : (
          <form method="post" action="/api/unsubscribe" className="flex flex-col items-center gap-3">
            <p>Stop getting emails like this from Petty Homes?</p>
            <input type="hidden" name="p" value={sp.p} /><input type="hidden" name="t" value={sp.t} />
            <button type="submit" className="btn btn-primary">Unsubscribe</button>
          </form>
        )}
    </main>
  );
}
