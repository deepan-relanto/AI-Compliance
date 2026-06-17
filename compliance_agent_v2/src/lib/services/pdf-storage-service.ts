import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { getSql } from "@/lib/db";

const UPLOAD_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i;

export function pdfUrlToFilename(pdfUrl: string): string {
  const name = pdfUrl.replace(/^\//, "").split("/").pop() ?? "";
  if (!UPLOAD_FILENAME.test(name)) {
    throw new Error(`Invalid PDF path: ${pdfUrl}`);
  }
  return name;
}

export function localPdfPath(pdfUrl: string): string {
  const relative = pdfUrl.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const filePath = path.normalize(path.join(publicRoot, relative));
  if (!filePath.startsWith(publicRoot)) {
    throw new Error(`Invalid PDF path: ${pdfUrl}`);
  }
  return filePath;
}

function bufferFromDbValue(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "string") {
    if (/^[0-9a-f]+$/i.test(data) && data.length % 2 === 0) {
      return Buffer.from(data, "hex");
    }
    return Buffer.from(data, "base64");
  }
  throw new Error("Unsupported PDF blob format from database.");
}

/** Read PDF bytes — local disk cache first, then Neon pdf_storage. */
export async function getPdfBuffer(pdfUrl: string): Promise<Buffer> {
  const local = localPdfPath(pdfUrl);
  if (fs.existsSync(local)) {
    return fs.readFileSync(local);
  }

  const filename = pdfUrlToFilename(pdfUrl);
  const sql = getSql();
  const rows = await sql`
    SELECT data FROM pdf_storage WHERE filename = ${filename} LIMIT 1
  `;

  if (rows.length === 0 || rows[0].data == null) {
    throw new Error(`PDF not found in storage: ${pdfUrl}`);
  }

  const buffer = bufferFromDbValue(rows[0].data);
  try {
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, buffer);
  } catch {
    /* cache optional */
  }
  return buffer;
}

export async function pdfExists(pdfUrl: string): Promise<boolean> {
  try {
    if (fs.existsSync(localPdfPath(pdfUrl))) return true;
    const filename = pdfUrlToFilename(pdfUrl);
    const sql = getSql();
    const rows = await sql`
      SELECT 1 FROM pdf_storage WHERE filename = ${filename} LIMIT 1
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Persist PDF in Neon so Render redeploys do not lose uploads. */
export async function storePdfInDatabase(pdfUrl: string, buffer: Buffer): Promise<void> {
  const filename = pdfUrlToFilename(pdfUrl);
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const sql = getSql();
  await sql`
    INSERT INTO pdf_storage (filename, pdf_url, data, content_hash, size_bytes)
    VALUES (${filename}, ${pdfUrl}, ${buffer}, ${contentHash}, ${buffer.length})
    ON CONFLICT (filename) DO UPDATE SET
      pdf_url = EXCLUDED.pdf_url,
      data = EXCLUDED.data,
      content_hash = EXCLUDED.content_hash,
      size_bytes = EXCLUDED.size_bytes,
      updated_at = NOW()
  `;
}

export async function deletePdfFromStorage(pdfUrl: string): Promise<void> {
  try {
    const local = localPdfPath(pdfUrl);
    if (fs.existsSync(local)) fs.unlinkSync(local);
  } catch {
    /* ignore */
  }
  try {
    const filename = pdfUrlToFilename(pdfUrl);
    const sql = getSql();
    await sql`DELETE FROM pdf_storage WHERE filename = ${filename}`;
  } catch {
    /* ignore */
  }
}
