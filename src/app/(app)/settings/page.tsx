import { requireUser } from "@/server/auth";
import { loadSoundPrefs } from "@/server/sounds";
import { SoundsClient } from "./SoundsClient";

export const dynamic = "force-dynamic";

/** My settings (owner request 2026-11-10): things each person sets for themselves. */
export default async function Page() {
  const user = await requireUser();
  const prefs = await loadSoundPrefs(user.id);
  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <h1 className="text-2xl font-extrabold">My settings</h1>
      <p className="mb-4 mt-1 text-sm muted">Just for you, {user.name.split(" ")[0]}. Nobody else&apos;s HQ changes.</p>
      <SoundsClient initial={prefs} />
    </div>
  );
}
