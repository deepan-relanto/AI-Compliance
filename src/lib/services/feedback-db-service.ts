import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

export interface FeedbackRow {
  id: string;
  userId: string;
  userName: string;
  assessmentId: string;
  assessmentName: string;
  feedbackText: string;
  createdAt: string;
  batchId: string | null;
  batchLabel: string | null;
}

export async function listFeedback(sql: Sql): Promise<FeedbackRow[]> {
  const rows = await sql`
    SELECT
      fe.id,
      fe.user_id,
      fe.user_name,
      fe.assessment_id,
      fe.assessment_name,
      fe.feedback_text,
      fe.created_at,
      u.batch_id,
      b.label AS batch_label
    FROM feedback_entries fe
    LEFT JOIN users u ON LOWER(u.email) = LOWER(fe.user_id)
    LEFT JOIN batches b ON b.id = u.batch_id
    ORDER BY fe.created_at DESC
  `;

  return rows.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    userName: r.user_name as string,
    assessmentId: r.assessment_id as string,
    assessmentName: r.assessment_name as string,
    feedbackText: r.feedback_text as string,
    createdAt: r.created_at as string,
    batchId: (r.batch_id as string) ?? null,
    batchLabel: (r.batch_label as string) ?? null,
  }));
}

export async function createFeedback(
  sql: Sql,
  params: {
    id: string;
    userId: string;
    userName: string;
    assessmentId: string;
    assessmentName: string;
    feedbackText: string;
  },
): Promise<FeedbackRow> {
  await sql`
    INSERT INTO feedback_entries (id, user_id, user_name, assessment_id, assessment_name, feedback_text)
    VALUES (
      ${params.id},
      ${params.userId},
      ${params.userName},
      ${params.assessmentId},
      ${params.assessmentName},
      ${params.feedbackText}
    )
  `;

  const rows = await sql`
    SELECT
      fe.id,
      fe.user_id,
      fe.user_name,
      fe.assessment_id,
      fe.assessment_name,
      fe.feedback_text,
      fe.created_at,
      u.batch_id,
      b.label AS batch_label
    FROM feedback_entries fe
    LEFT JOIN users u ON LOWER(u.email) = LOWER(fe.user_id)
    LEFT JOIN batches b ON b.id = u.batch_id
    WHERE fe.id = ${params.id}
    LIMIT 1
  `;

  const r = rows[0];
  return {
    id: r.id as string,
    userId: r.user_id as string,
    userName: r.user_name as string,
    assessmentId: r.assessment_id as string,
    assessmentName: r.assessment_name as string,
    feedbackText: r.feedback_text as string,
    createdAt: r.created_at as string,
    batchId: (r.batch_id as string) ?? null,
    batchLabel: (r.batch_label as string) ?? null,
  };
}

/** email → batch for enriching legacy localStorage entries */
export async function getUserBatchMap(
  sql: Sql,
): Promise<Record<string, { batchId: string; batchLabel: string }>> {
  const rows = await sql`
    SELECT u.email, u.batch_id, b.label AS batch_label
    FROM users u
    LEFT JOIN batches b ON b.id = u.batch_id
    WHERE u.batch_id IS NOT NULL
  `;
  const map: Record<string, { batchId: string; batchLabel: string }> = {};
  for (const r of rows) {
    map[(r.email as string).toLowerCase()] = {
      batchId: r.batch_id as string,
      batchLabel: (r.batch_label as string) ?? (r.batch_id as string),
    };
  }
  return map;
}
