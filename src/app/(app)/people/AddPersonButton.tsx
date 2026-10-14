"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPerson } from "./actions";
import type { Options } from "@/server/people";
import { Modal } from "@/components/Modal";
import { PARTNER_TYPES } from "@/lib/partners";

export function AddPersonButton({ options }: { options: Options }) {
  const [open, setOpen] = useState(false);
  const [two, setTwo] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const lead = options.stages.find((s) => s.name === "Lead")?.id ?? "";
  const [stage, setStage] = useState(lead);
  // Picking the Industry Partners stage asks what kind of partner and their company (SPEC.md §6.4).
  const partner = /industry partner/i.test(options.stages.find((s) => s.id === stage)?.name ?? "");

  function submit(form: FormData) {
    const g = (k: string) => String(form.get(k) ?? "");
    setError("");
    start(async () => {
      const res = await createPerson({
        first: g("first"), last: g("last"), phone: g("phone"), email: g("email"),
        second: two ? { first: g("gfirst"), last: g("glast"), phone: g("gphone"), email: g("gemail") } : undefined,
        stageId: g("stageId"), sourceId: g("sourceId"),
        ...(partner ? { partnerType: g("partnerType"), company: g("company") } : {}),
      });
      if (!res.ok) { setError(res.error); return; }
      setOpen(false); setTwo(false); setStage(lead);
      router.push(`/people/${res.data!.id}`);
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary whitespace-nowrap" onClick={() => setOpen(true)}>+ Add person</button>
      {open && (
        <Modal title="Add person" onClose={() => setOpen(false)}>
          <form action={submit} autoComplete="off" className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="label">First name<input className="input" name="first" required autoFocus /></label>
              <label className="label">Last name<input className="input" name="last" /></label>
              <label className="label">Phone<input className="input" name="phone" inputMode="tel" /></label>
              <label className="label">Email<input className="input" name="email" type="email" /></label>
            </div>
            {two ? (
              <fieldset className="rounded-lg border border-misty p-3">
                <legend className="px-1 text-sm font-bold">Second person</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="label">First name<input className="input" name="gfirst" /></label>
                  <label className="label">Last name<input className="input" name="glast" placeholder="Leave blank if the same" /></label>
                  <label className="label">Phone<input className="input" name="gphone" inputMode="tel" /></label>
                  <label className="label">Email<input className="input" name="gemail" type="email" /></label>
                </div>
              </fieldset>
            ) : (
              <button type="button" className="btn self-start" onClick={() => setTwo(true)}>+ Add a second person (spouse, partner, co-buyer)</button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="label">Stage
                <select className="input" name="stageId" value={stage} onChange={(e) => setStage(e.target.value)}>{options.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
              <label className="label">Source
                <select className="input" name="sourceId" defaultValue=""><option value="">—</option>{options.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </label>
            </div>
            {partner && (
              <div className="grid grid-cols-2 gap-2">
                <label className="label">Type
                  <select className="input" name="partnerType" defaultValue="lender" required>{PARTNER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </label>
                <label className="label">Company<input className="input" name="company" placeholder="e.g. Bell Bank Mortgage" /></label>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
