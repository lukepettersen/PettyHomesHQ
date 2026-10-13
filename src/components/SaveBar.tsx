"use client";

/** "You have unsaved changes · Discard / Save changes" (SPEC.md §5). */
export function SaveBar({ dirty, pending, error, onSave, onDiscard }: { dirty: boolean; pending: boolean; error?: string; onSave: () => void; onDiscard: () => void }) {
  if (!dirty && !error) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-misty bg-white px-4 py-2.5 shadow-xl">
      <span className={`text-sm font-semibold ${error ? "text-bad" : ""}`}>{error || "You have unsaved changes"}</span>
      <button type="button" className="btn" onClick={onDiscard} disabled={pending}>Discard</button>
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
    </div>
  );
}
