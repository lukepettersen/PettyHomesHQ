"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resumeBulkEmail } from "../bulkEmailActions";

/** Resume a mass email that stopped (e.g. while Google was disconnected): it sends to whoever hasn't got it yet. */
export function ResumeButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn btn-primary px-2 py-0.5 text-xs" disabled={pending}
        onClick={() => start(async () => { setError(""); const r = await resumeBulkEmail(id); if (!r.ok) setError(r.error); else router.refresh(); })}>Resume</button>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </>
  );
}
