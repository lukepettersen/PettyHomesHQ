"use client";

import { useState } from "react";
import { FILE_AUTOMATION_KEYS, FILE_LOCKED_KEYS, type FileKind, type FileSection } from "@/lib/files";
import type { StatusRow } from "@/server/files";
import { saveFileForm } from "../../pipeline/actions";
import { FormEditor } from "../forms/FormsClient";

export function FileFormsClient({ forms, statuses }: { forms: Record<FileKind, FileSection[]>; statuses: Record<FileKind, StatusRow[]> }) {
  const [kind, setKind] = useState<FileKind>("buyer");
  return (
    <>
      <div role="tablist" aria-label="Form" className="mb-3 flex gap-1 border-b border-misty">
        {(["buyer", "listing"] as const).map((k) => (
          <button key={k} role="tab" type="button" aria-selected={kind === k} onClick={() => setKind(k)}
            className={`-mb-px border-b-[3px] px-3 py-2 ${kind === k ? "border-coral font-semibold" : "border-transparent muted"}`}>{k === "buyer" ? "Buyer" : "Listing"}</button>
        ))}
      </div>
      <FormEditor key={kind} initial={forms[kind]} statuses={statuses[kind]} locked={FILE_LOCKED_KEYS[kind]} automation={FILE_AUTOMATION_KEYS}
        onSave={(sections) => saveFileForm({ kind, sections })} />
    </>
  );
}
