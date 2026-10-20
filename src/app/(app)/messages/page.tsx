import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { isConnected } from "@/server/integrations";
import { loadConversation, loadThreads, personForNumber, textComposerFor, isUnsubscribed } from "@/server/texting";
import { normalizePhone } from "@/lib/normalize";
import { MessagesApp } from "./MessagesApp";

export const dynamic = "force-dynamic";

/** Messages (SPEC.md §11): texts and missed calls on each team member's business number. */
export default async function Page({ searchParams }: { searchParams: Promise<{ line?: string; n?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (!isConnected("texting")) return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-extrabold">Messages</h1>
      <div className="card mt-4 flex flex-col gap-2 p-5 text-sm">
        <b>Texting isn&apos;t connected yet.</b>
        <p>Texts and missed calls from your business numbers show here once Twilio is connected. An Admin adds the Twilio keys in Railway, then each person&apos;s number in Admin → Integrations.</p>
        <p className="muted">Until then, use Log text on a contact for texts sent from your own phone.</p>
      </div>
    </div>
  );
  const lines = (await db.user.findMany({ where: { status: { not: "DISABLED" }, textNumber: { not: null } }, orderBy: [{ isOwner: "desc" }, { name: "asc" }], select: { id: true, name: true, textNumber: true } }))
    .map((u) => ({ userId: u.id, name: u.name, number: u.textNumber! }));
  // Your own number first; you can look at a teammate's conversations too.
  const line = lines.find((l) => l.userId === sp.line) ?? lines.find((l) => l.userId === user.id) ?? lines[0] ?? null;
  const threads = line ? await loadThreads(line.number) : [];
  const open = sp.n ? normalizePhone(sp.n) : null;
  const thread = open ? threads.find((t) => t.number === open) : undefined;
  const person = thread?.personId ? { id: thread.personId, name: thread.name } : open ? await personForNumber(open) : null;
  const conversation = line && open ? await loadConversation(line.number, open) : [];
  const composer = await textComposerFor(user, person && (await isUnsubscribed(person.id)) ? person.name : null);
  const mine = line?.userId === user.id;
  return (
    <MessagesApp lines={lines} line={line} threads={threads} open={open} person={person} conversation={conversation}
      composer={{ ...composer, blocked: composer.blocked ?? (mine ? null : `These are ${line?.name.split(" ")[0]}'s texts. Replies go from each person's own number, so switch to your number to text.`) }} />
  );
}
