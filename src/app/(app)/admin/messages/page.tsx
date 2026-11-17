import { redirect } from "next/navigation";

// Text and email templates are separate pages now (owner request 2026-10-29); old links land on the right one.
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; t?: string }> }) {
  const sp = await searchParams;
  redirect(`/admin/${sp.kind === "text" ? "text" : "email"}-templates${sp.t ? `?t=${encodeURIComponent(sp.t)}` : ""}`);
}
