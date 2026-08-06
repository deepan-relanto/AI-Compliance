export default function AdminLoading() {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="hidden w-56 border-r border-zinc-800 lg:block" />
      <main className="flex-1 p-6 space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-zinc-800/40" />
      </main>
    </div>
  );
}
