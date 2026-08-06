export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-950 p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
