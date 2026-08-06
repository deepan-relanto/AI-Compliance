export default function TrainingLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-orange-500" />
        <p className="text-sm text-zinc-500">Loading training…</p>
      </div>
    </div>
  );
}
