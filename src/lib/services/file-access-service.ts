import type { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

/**
 * Admins may read any stored asset. Learners may only read assets tied to a
 * module currently assigned to their batch (or a PDF upload for such a module).
 */
export async function canAccessCourseAsset(
  sql: Sql,
  email: string,
  assetUrl: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;

  const users = await sql`
    SELECT batch_id, role FROM users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  if (!users.length) return false;
  if ((users[0].role as string) === "admin") return true;

  const batchId = users[0].batch_id as string | null;
  if (!batchId) return false;

  const hits = await sql`
    SELECT 1
    FROM course_module_steps s
    INNER JOIN course_module_batches cmb ON cmb.module_id = s.module_id
    WHERE cmb.batch_id = ${batchId}
      AND (
        s.config->>'assetUrl' = ${assetUrl}
        OR s.config->>'assetUrl' LIKE ${`%/course-assets/${assetUrl.split("/").pop()}`}
      )
    LIMIT 1
  `;
  return hits.length > 0;
}

export async function canAccessUploadPdf(
  sql: Sql,
  email: string,
  pdfUrl: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;

  const users = await sql`
    SELECT batch_id, role FROM users
    WHERE LOWER(email) = LOWER(${email})
    LIMIT 1
  `;
  if (!users.length) return false;
  if ((users[0].role as string) === "admin") return true;

  const batchId = users[0].batch_id as string | null;
  if (!batchId) return false;

  const filename = pdfUrl.split("/").pop() ?? "";
  const hits = await sql`
    SELECT 1
    FROM training_modules m
    INNER JOIN module_batches mb ON mb.module_id = m.id
    WHERE mb.batch_id = ${batchId}
      AND (
        m.pdf_url = ${pdfUrl}
        OR m.pdf_url LIKE ${`%/uploads/${filename}`}
      )
    LIMIT 1
  `;
  return hits.length > 0;
}
