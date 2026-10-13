"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignInButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => { setBusy(true); signIn("google", { callbackUrl: "/" }); }}
      className="w-full rounded-lg bg-accent px-4 py-2.5 font-bold text-white hover:bg-moss disabled:opacity-60"
    >
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}
