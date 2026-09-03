import type { SWRConfiguration } from "swr";

/** Shared SWR defaults — faster admin panels with less duplicate fetching. */
export const adminSwrConfig: SWRConfiguration = {
  dedupingInterval: 15_000,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  keepPreviousData: true,
  errorRetryCount: 2,
  focusThrottleInterval: 20_000,
};

export async function adminFetcher(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { credentials: "same-origin" });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data?.ok === false) {
    const message =
      (typeof data?.error === "string" && data.error) ||
      (typeof data?.message === "string" && data.message) ||
      `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}
