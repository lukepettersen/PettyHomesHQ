// Shown the moment a tab or link is clicked, while the next page is put together (big lists take a second).
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-sm muted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-misty border-t-accent" aria-hidden="true" />
        Loading…
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[250px_minmax(0,1fr)]" aria-hidden="true">
        <div className="hidden h-64 animate-pulse rounded-xl bg-sunken md:block" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-sunken" />)}
        </div>
      </div>
    </div>
  );
}
