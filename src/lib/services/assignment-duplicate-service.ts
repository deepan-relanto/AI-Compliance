import { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

export interface AssignmentBatchConflict {
  batchId: string;
  batchLabel: string;
  moduleId: string;
  moduleTitle: string;
}

function normalizeAssignmentTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Batches that already have an assignment with the same title (case-insensitive). */
export async function findAssignmentBatchConflicts(
  sql: Sql,
  params: {
    title: string;
    batchIds: string[];
    excludeModuleId?: string | null;
  },
): Promise<AssignmentBatchConflict[]> {
  const normalized = normalizeAssignmentTitle(params.title);
  if (!normalized || params.batchIds.length === 0) return [];

  const rows = await sql`
    SELECT
      b.id AS batch_id,
      b.label AS batch_label,
      tm.id AS module_id,
      tm.title AS module_title
    FROM module_batches mb
    INNER JOIN training_modules tm ON tm.id = mb.module_id
    INNER JOIN batches b ON b.id = mb.batch_id
    WHERE LOWER(TRIM(tm.title)) = ${normalized}
      AND mb.batch_id = ANY(${params.batchIds}::text[])
      AND (${params.excludeModuleId ?? null}::text IS NULL OR tm.id <> ${params.excludeModuleId ?? null})
    ORDER BY b.label, tm.title
  `;

  return rows.map((row) => ({
    batchId: row.batch_id as string,
    batchLabel: row.batch_label as string,
    moduleId: row.module_id as string,
    moduleTitle: row.module_title as string,
  }));
}

export function formatAssignmentConflictMessage(
  conflicts: AssignmentBatchConflict[],
  assignmentTitle: string,
): string {
  if (conflicts.length === 0) return "";

  const batchLabels = [...new Set(conflicts.map((c) => c.batchLabel))];
  const batchList =
    batchLabels.length === 1
      ? `"${batchLabels[0]}"`
      : batchLabels.map((label) => `"${label}"`).join(", ");

  return `Assignment "${assignmentTitle.trim()}" is already assigned to ${batchList}. Change the assignment name to push it to the same batch again, or choose different batches.`;
}
