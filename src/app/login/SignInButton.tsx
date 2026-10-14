"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { REMEMBER_COOKIE } from "@/lib/session";

export function SignInButton() {
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const go = () => {
    // Read by the server when Google sends you back; only says whether to keep this device signed in.
    document.cookie = remember ? `${REMEMBER_COOKIE}=1; path=/; max-age=900; samesite=lax${location.protocol === "https:" ? "; secure" : ""}` : `${REMEMBER_COOKIE}=; path=/; max-age=0`;
    setBusy(true); signIn("google", { callbackUrl: "/" });
  };
  return (
    <>
    <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Keep me signed in on this device</label>
    <button
      type="button"
      disabled={busy}
      onClick={go}
      className="w-full rounded-lg bg-accent px-4 py-2.5 font-bold text-white hover:bg-moss disabled:opacity-60"
    >
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
    <p className="mt-2 text-xs muted">Leave it unticked on shared computers: you&apos;ll be signed out after 12 hours.</p>
    </>
  );
}
