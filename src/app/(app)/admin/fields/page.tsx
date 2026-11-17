import { adminGate } from "../gate";
import { db } from "@/server/db";
import { FieldsClient } from "./FieldsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await adminGate();
  if (denied) return denied;
  const fields = await db.customField.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { values: true } } } });
  return (
    <>
      <h1 className="text-2xl font-extrabold">Custom fields</h1>
      <p className="mb-4 mt-1 text-sm muted">Extra fields on people. They show in the &quot;More details&quot; card on each contact. Built-in fields (name, phones, stage, dates) aren&apos;t listed here.</p>
      <FieldsClient fields={fields.map((f) => ({ id: f.id, name: f.name, type: f.type, options: f.options, used: f._count.values }))} />
    </>
  );
}
