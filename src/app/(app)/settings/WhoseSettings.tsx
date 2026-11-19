"use client";

import { useRouter } from "next/navigation";

/** The owner's picker: your own settings or a teammate's. */
export function WhoseSettings({ team, me, current }: { team: { id: string; name: string }[]; me: string; current: string }) {
  const router = useRouter();
  return (
    <label className="mb-4 flex items-center gap-2 text-sm font-semibold">Settings for
      <select className="input w-auto" value={current} onChange={(e) => router.push(e.target.value === me ? "/settings" : `/settings?for=${e.target.value}`)}>
        {team.map((t) => <option key={t.id} value={t.id}>{t.id === me ? `${t.name} (you)` : t.name}</option>)}
      </select>
    </label>
  );
}
