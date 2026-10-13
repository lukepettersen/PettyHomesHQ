export function ComingSoon({ title, when, what }: { title: string; when: string; what: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <div className="card mt-6 p-6">
        <h2 className="font-bold">Coming in {when}</h2>
        <p className="mt-1 text-sm muted">{what}</p>
      </div>
    </main>
  );
}
