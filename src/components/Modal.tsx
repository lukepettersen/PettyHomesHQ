"use client";

import { useEffect } from "react";

export function Modal({ title, onClose, children, wide, full, extra }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; full?: boolean; extra?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/35 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${full ? "max-w-6xl" : wide ? "max-w-2xl" : "max-w-lg"} rounded-xl bg-white p-5 shadow-xl`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <span className="flex items-center gap-4">{extra}<button type="button" onClick={onClose} aria-label="Close" className="text-2xl leading-none muted hover:text-charcoal">×</button></span>
        </div>
        {children}
      </div>
    </div>
  );
}
