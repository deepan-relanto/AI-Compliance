import { invalidateCache } from "@/lib/api-cache";

/** Bust server-side caches after data that affects admin dashboards changes. */
export function invalidateAdminCaches(): void {
  invalidateCache("analytics:");
  invalidateCache("batches:");
  invalidateCache("batch:perf:");
  invalidateCache("content:course-library");
  invalidateCache("content:compliance-library");
}

/** Non-blocking cache bust — use on hot learner paths (MCQ submit, etc.). */
export function invalidateAdminCachesAsync(): void {
  queueMicrotask(() => invalidateAdminCaches());
}
