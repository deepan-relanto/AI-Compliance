"use client";

import type { BatchInfo } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

const CLIENT_TTL_MS = 60_000;

let cachedBatches: BatchInfo[] | null = null;
let cacheTimestamp = 0;
let inflight: Promise<BatchInfo[]> | null = null;

export function mapBatchRow(row: Record<string, unknown>): BatchInfo {
  return {
    id: row.id as string,
    label: row.label as string,
    description: (row.description as string) ?? "",
    memberCount: Number(row.member_count ?? row.memberCount ?? 0),
    compliance: Number(row.compliance ?? 0),
    passRate: Number(row.pass_rate ?? row.passRate ?? 0),
    failRate: Number(row.fail_rate ?? row.failRate ?? 0),
    activeSessions: Number(row.active_sessions ?? row.activeSessions ?? 0),
  };
}

export function invalidateBatchesClientCache(): void {
  cachedBatches = null;
  cacheTimestamp = 0;
}

export async function fetchBatches(force = false): Promise<BatchInfo[]> {
  if (!force && cachedBatches && Date.now() - cacheTimestamp < CLIENT_TTL_MS) {
    return cachedBatches;
  }
  if (inflight) return inflight;

  inflight = fetch("/api/batches")
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok || !Array.isArray(data.batches)) {
        throw new Error(data.error ?? "Could not load batches.");
      }
      const next = data.batches.map((row: Record<string, unknown>) => mapBatchRow(row));
      cachedBatches = next;
      cacheTimestamp = Date.now();
      return next;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight as Promise<BatchInfo[]>;
}

export function useBatches() {
  const [batches, setBatches] = useState<BatchInfo[]>(cachedBatches ?? []);
  const [loading, setLoading] = useState(cachedBatches === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = true) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchBatches(force);
      setBatches(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load batches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (cachedBatches) {
      setBatches(cachedBatches);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchBatches()
      .then((next) => {
        if (!cancelled) {
          setBatches(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load batches.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { batches, loading, error, refresh };
}
