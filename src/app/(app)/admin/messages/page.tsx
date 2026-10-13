import { adminGate } from "../gate";
import { db } from "@/server/db";
import { MessagesClient } from "./MessagesClient";
import { loadMergeForms } from "@/server/merge";
import { formMergeFields } from "@/lib/merge";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string; t?: string }> }) {
  const denied = await adminGate("editMessageTemplates");
  if (denied) return denied;
  const [rows, sp, forms] = await Promise.all([db.messageTemplate.findMany({ orderBy: [{ folder: "asc" }, { name: "asc" }] }), searchParams, loadMergeForms()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">Text &amp; email templates</h1>
      <p className="mb-4 mt-1 text-sm muted">
        Messages used by email and text steps in task templates (the Draft email / Draft text button on a task). Merge fields like {"{first_name}"} fill in from the person and their contract.
      </p>
      <MessagesClient templates={rows.map(({ id, kind, name, folder, subject, body }) => ({ id, kind: kind as "email" | "text", name, folder, subject, body }))}
        initialKind={sp.kind === "text" ? "text" : "email"} initialId={sp.t ?? null} fields={formMergeFields(forms)} />
    </>
  );
}
