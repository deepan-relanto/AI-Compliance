import { NextResponse } from "next/server";

type JsonBody = Record<string, unknown> | object;
type JsonRecord = Record<string, unknown>;

export type ApiCacheStatus = "HIT" | "STALE" | "MISS";

/** Standard private JSON response headers for authenticated API routes. */
export function privateApiHeaders(cache?: ApiCacheStatus): HeadersInit {
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-cache",
  };
  if (cache) headers["X-Cache"] = cache;
  return headers;
}

export function jsonOk(
  body: JsonBody,
  options?: { status?: number; cache?: ApiCacheStatus },
): NextResponse {
  return NextResponse.json(
    { ok: true, ...body },
    {
      status: options?.status ?? 200,
      headers: privateApiHeaders(options?.cache),
    },
  );
}

export function jsonError(
  error: string,
  status = 500,
  extra?: JsonRecord,
): NextResponse {
  return NextResponse.json(
    { ok: false, error, ...extra },
    { status, headers: privateApiHeaders() },
  );
}
