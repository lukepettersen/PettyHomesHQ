"use client";

import { useState } from "react";
import { toHtml } from "@/lib/email";
import { Modal } from "@/components/Modal";

/** "Preview" button next to Send (owner request 2026-11-23): the email as it will look in their inbox, in a pop-up,
 *  with who it goes to and the subject. Images, clickable links, bold and lists show as they'll arrive. */
export function EmailPreview({ body, subject = "", to = [], signature = false, from = "" }: { body: string; subject?: string; to?: string[]; signature?: boolean; from?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" disabled={!body.trim()} onClick={() => setOpen(true)}>Preview</button>
      {open && (
        <Modal title="Preview" onClose={() => setOpen(false)} wide>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {from && <><dt className="muted">From</dt><dd>{from}</dd></>}
            {to.length > 0 && <><dt className="muted">To</dt><dd className="break-words">{to.join(", ")}</dd></>}
            <dt className="muted">Subject</dt><dd className="font-semibold">{subject || <span className="font-normal text-[#9a6400]">No subject yet</span>}</dd>
          </dl>
          {/* toHtml escapes everything typed and only adds images, links, bold and lists, so this is safe to show. */}
          <div className="mt-3 max-h-[60vh] overflow-auto rounded-md border border-misty bg-white p-4 text-sm font-normal [&_a]:text-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: toHtml(body) }} />
          {signature && <p className="mt-2 text-xs muted">Your Gmail signature is added at the bottom when it sends.</p>}
          <div className="mt-3 flex justify-end"><button type="button" className="btn" onClick={() => setOpen(false)}>Close</button></div>
        </Modal>
      )}
    </>
  );
}
