"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="rounded-md border border-misty/50 px-2.5 py-1 hover:bg-white/10">
      Sign out
    </button>
  );
}
