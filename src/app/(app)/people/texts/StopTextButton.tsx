"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { stopBulkText } from "../bulkTextActions";

/** Two-step Stop for a mass text; the ones already sent stay sent. */
export function StopTextButton({ id }: { id: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn text-bad" disabled={pending} onBlur={() => setSure(false)}
      onClick={() => (sure ? start(async () => { await stopBulkText(id); router.refresh(); }) : setSure(true))}>{sure ? "Click again to stop" : "Stop"}</button>
  );
}
