import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import {
  getEmployeeFacets,
  listEmployees,
} from "@/lib/services/employee-directory-service";
import { NextRequest, NextResponse } from "next/server";

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
      const facets = await getEmployeeFacets(sql);
      return NextResponse.json({ ok: true, facets });
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
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load employees";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
