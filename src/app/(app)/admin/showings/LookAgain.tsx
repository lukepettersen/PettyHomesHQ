"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lookAgain } from "./actions";

/** Read the last 3 days of Gmail now: missed showing emails are picked up; ones already in HQ are skipped. */
export function LookAgain() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      {msg && <span role="status" className="text-xs muted">{msg}</span>}
      <button type="button" className="btn text-sm" disabled={pending}
        onClick={() => start(async () => { setMsg(""); const r = await lookAgain(); setMsg(r.ok ? "Done. Anything new is below." : r.error); router.refresh(); })}>
        {pending ? "Reading Gmail…" : "Look again (last 3 days)"}
      </button>
    </span>
  );
}
