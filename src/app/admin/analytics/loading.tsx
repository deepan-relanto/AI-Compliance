export default function AnalyticsLoading() {
  return (
    <div className="flex min-h-screen bg-zinc-950">
      <aside className="hidden w-56 border-r border-zinc-800 lg:block" />
      <main className="flex-1 p-6 space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-zinc-800/40" />
      </main>
    </div>
  );
}
