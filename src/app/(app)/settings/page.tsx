import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { loadAlertPrefs, loadSoundPrefs } from "@/server/sounds";
import { SoundsClient } from "./SoundsClient";
import { AlertsClient } from "./AlertsClient";
import { WhoseSettings } from "./WhoseSettings";

export const dynamic = "force-dynamic";

/** My settings (owner request 2026-11-10): things each person sets for themselves. The owner can also pick a teammate
 *  and change their sounds and alerts (owner request 2026-11-19). */
export default async function Page({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const user = await requireUser();
  const team = user.isOwner ? await db.user.findMany({ where: { status: { not: "DISABLED" } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }) : [];
  const asked = (await searchParams).for;
  const target = team.find((t) => t.id === asked && t.id !== user.id) ?? null;
  const forId = target?.id ?? user.id;
  const [prefs, alerts] = await Promise.all([loadSoundPrefs(forId), loadAlertPrefs(forId)]);
  const other = target ? target.name.split(" ")[0] : null;
  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h1 className="text-2xl font-extrabold">{other ? `${other}'s settings` : "My settings"}</h1>
      <p className="mb-4 mt-1 text-sm muted">{other ? `You're changing ${other}'s sounds and alerts. Saving changes them on ${other}'s HQ.` : `Just for you, ${user.name.split(" ")[0]}. Nobody else's HQ changes.`}</p>
      {team.length > 1 && <WhoseSettings team={team} me={user.id} current={forId} />}
      {user.isOwner && team.length > 1 && (
        <section className="card mb-4 p-4" aria-labelledby="viewas">
          <h2 id="viewas" className="font-bold">See HQ as a teammate</h2>
          <p className="mt-1 text-sm muted">Look around HQ exactly as they see it: their tasks, their Messages, what they can and can&apos;t open (no commissions, no Sales). Look only: nothing can be changed or sent while you&apos;re in it. Click <b>Back to my view</b> at the top to return.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {team.filter((t) => t.id !== user.id).map((t) => <a key={t.id} href={`/api/view-as?user=${t.id}`} className="btn">View as {t.name.split(" ")[0]}</a>)}
          </div>
        </section>
      )}
      <SoundsClient key={`s${forId}`} initial={prefs} forId={target?.id} />
      <AlertsClient key={`a${forId}`} initial={alerts} forId={target?.id} who={other} />
    </div>
  );
}
