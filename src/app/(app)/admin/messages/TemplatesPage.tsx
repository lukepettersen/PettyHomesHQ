import { adminGate } from "../gate";
import { db } from "@/server/db";
import { MessagesClient } from "./MessagesClient";
import { loadMergeForms } from "@/server/merge";
import { formMergeFields } from "@/lib/merge";

/** Text templates and Email templates, each its own Admin page (owner request 2026-10-29). */
export async function TemplatesPage({ kind, t }: { kind: "text" | "email"; t?: string }) {
  const denied = await adminGate("editMessageTemplates");
  if (denied) return denied;
  const [rows, forms] = await Promise.all([db.messageTemplate.findMany({ where: { kind }, orderBy: [{ folder: "asc" }, { name: "asc" }] }), loadMergeForms()]);
  return (
    <>
      <h1 className="text-2xl font-extrabold">{kind === "text" ? "Text templates" : "Email templates"}</h1>
      <p className="mb-4 mt-1 text-sm muted">
        {kind === "text" ? "Texts" : "Emails"} you can pick when writing one, use with &quot;/name&quot;, or attach to a checklist step (Draft {kind} and automatic sends). Merge fields like {"{first_name}"} fill in from the person and their contract.
      </p>
      <MessagesClient templates={rows.map(({ id, kind: k, name, folder, subject, body }) => ({ id, kind: k as "email" | "text", name, folder, subject, body }))}
        initialKind={kind} fixedKind initialId={t ?? null} fields={formMergeFields(forms)} />
    </>
  );
}
