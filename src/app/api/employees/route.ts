import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  getEmployeeFacets,
  listEmployees,
} from "@/lib/services/employee-directory-service";
import {
  CACHE_KEYS,
  CACHE_TTL,
  swrLoad,
} from "@/lib/api-cache";
import { jsonError, jsonOk } from "@/lib/api-json";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function parseList(values: string | string[] | null): string[] | undefined {
  if (!values) return undefined;
  const list = Array.isArray(values) ? values : [values];
  const parsed = list.map((s) => s.trim()).filter(Boolean);
  return parsed.length ? parsed : undefined;
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const sp = req.nextUrl.searchParams;
  const facetsOnly = sp.get("facets") === "1";

  try {
    const sql = getSql();
    if (facetsOnly) {
      const softSec = Math.ceil(CACHE_TTL.employeeFacets / 1000);
      const { data, status } = await swrLoad(
        CACHE_KEYS.employeeFacets,
        softSec,
        softSec * 3,
        () => getEmployeeFacets(sql),
      );
      return jsonOk({ facets: data }, { cache: status });
    }

    const result = await listEmployees(sql, {
      search: sp.get("search") ?? undefined,
      departments: parseList(sp.getAll("departments")),
      locations: parseList(sp.getAll("locations")),
      genders: parseList(sp.getAll("genders")),
      jobTitles: parseList(sp.getAll("jobTitles")),
      workerTypes: parseList(sp.getAll("workerTypes")),
      dateJoinedFrom: sp.get("dateJoinedFrom") ?? undefined,
      dateJoinedTo: sp.get("dateJoinedTo") ?? undefined,
      unassignedOnly: sp.get("unassignedOnly") === "1",
      page: Number(sp.get("page") ?? "1"),
      limit: Number(sp.get("limit") ?? "50"),
      all: sp.get("all") === "1",
    });

    return jsonOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load employees";
    return jsonError(message);
  }
}
