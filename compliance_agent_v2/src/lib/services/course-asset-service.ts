import crypto from "crypto";
import fs from "fs";
import path from "path";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { getDatabaseUrl, getSql } from "@/lib/db";

const ASSETS_DIR = path.join(process.cwd(), "public", "course-assets");
const MAX_BYTES = 100 * 1024 * 1024;
/** Neon HTTP SQL requests are capped (~64MB encoded). Large videos use WS Pool. */
const HTTP_SAFE_BYTES = 40 * 1024 * 1024;

let wsPool: Pool | null = null;

async function getWsPool(): Promise<Pool> {
  if (wsPool) return wsPool;
  try {
    const mod = await import("ws");
    neonConfig.webSocketConstructor = mod.default ?? mod;
  } catch {
    throw new Error(
      "Large course media needs the `ws` package. Run npm install ws",
    );
  }
  wsPool = new Pool({ connectionString: getDatabaseUrl() });
  return wsPool;
}
const ASSET_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

export type CourseAssetKind = "lesson" | "video" | "mindmap" | "infographic";

const ALLOWED: Record<CourseAssetKind, string[]> = {
  lesson: ["text/html", "application/xhtml+xml"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  mindmap: ["text/html", "application/xhtml+xml", "application/json"],
  infographic: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
};

const EXT_BY_MIME: Record<string, string> = {
  "text/html": ".html",
  "application/xhtml+xml": ".html",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "application/json": ".json",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

type AssetMeta = {
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

function ensureDir(): void {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }
}

function metaPath(filename: string): string {
  return path.join(ASSETS_DIR, `${filename}.meta.json`);
}

function readMeta(filename: string): AssetMeta | null {
  const p = metaPath(filename);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as AssetMeta;
  } catch {
    return null;
  }
}

function writeMeta(filename: string, meta: AssetMeta): void {
  fs.writeFileSync(metaPath(filename), JSON.stringify(meta), "utf8");
}

function mimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
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
  throw new Error("Unsupported course asset blob format from database.");
}

export function courseAssetUrlToFilename(assetUrl: string): string {
  const name = assetUrl.replace(/^\//, "").split("/").pop() ?? "";
  if (!ASSET_FILENAME.test(name)) {
    throw new Error(`Invalid course asset path: ${assetUrl}`);
  }
  return name;
}

export function isHtmlMimeOrExt(mimeType: string, fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".html" || ext === ".htm") return true;
  const mime = mimeType.toLowerCase();
  return mime === "text/html" || mime === "application/xhtml+xml" || mime.includes("html");
}

export function isAllowedCourseAsset(
  kind: CourseAssetKind,
  mimeType: string,
  fileName: string,
): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const allowed = ALLOWED[kind];
  if (allowed.includes(mimeType)) return true;

  if (kind === "lesson" && [".html", ".htm"].includes(ext)) return true;
  if (kind === "mindmap" && [".html", ".htm", ".json"].includes(ext)) return true;
  if (kind === "infographic" && [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext)) {
    return true;
  }
  if (kind === "video" && [".mp4", ".webm", ".mov"].includes(ext)) return true;
  return false;
}

/** Persist course media in Neon so Render redeploys do not lose uploads. */
export async function storeCourseAssetInDatabase(
  assetUrl: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const filename = courseAssetUrlToFilename(assetUrl);

  if (buffer.length <= HTTP_SAFE_BYTES) {
    const sql = getSql();
    await sql`
      INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
      VALUES (${filename}, ${assetUrl}, ${mimeType}, ${buffer.length}, ${buffer})
      ON CONFLICT (filename) DO UPDATE SET
        asset_url = EXCLUDED.asset_url,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        data = EXCLUDED.data
    `;
    return;
  }

  const pool = await getWsPool();
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO course_assets (filename, asset_url, mime_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (filename) DO UPDATE SET
         asset_url = EXCLUDED.asset_url,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         data = EXCLUDED.data`,
      [filename, assetUrl, mimeType, buffer.length, buffer],
    );
  } finally {
    client.release();
  }
}

/** Store course media on local disk and in Neon (public/course-assets + course_assets). */
export async function storeCourseAsset(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  kind: CourseAssetKind,
): Promise<{ assetUrl: string; mimeType: string; originalName: string }> {
  if (buffer.length > MAX_BYTES) {
    throw new Error("File exceeds the 100 MB limit.");
  }
  if (!isAllowedCourseAsset(kind, mimeType, originalName)) {
    throw new Error(`Invalid file type for ${kind}.`);
  }

  ensureDir();
  let ext = path.extname(originalName).toLowerCase();
  if (!ext) {
    ext = EXT_BY_MIME[mimeType] || ".bin";
  }
  if (ext === ".htm") ext = ".html";

  const resolvedMime =
    mimeType && mimeType !== "application/octet-stream"
      ? mimeType
      : mimeFromFilename(`file${ext}`);

  const filename = `${crypto.randomUUID()}${ext}`;
  const assetUrl = `/course-assets/${filename}`;
  const filePath = path.join(ASSETS_DIR, filename);

  fs.writeFileSync(filePath, buffer);
  writeMeta(filename, {
    mimeType: resolvedMime,
    originalName,
    sizeBytes: buffer.length,
  });

  try {
    await storeCourseAssetInDatabase(assetUrl, buffer, resolvedMime);
  } catch (err) {
    console.error("[course-asset] Failed to persist asset to database:", err);
    throw new Error(
      "File saved locally but could not be persisted to the database. Learners may lose media after redeploy.",
    );
  }

  return { assetUrl, mimeType: resolvedMime, originalName };
}

/** Read course asset bytes — local disk first, then Neon course_assets. */
export async function getCourseAssetBuffer(assetUrl: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const relative = assetUrl.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.normalize(path.join(publicRoot, relative));

  if (localPath.startsWith(publicRoot) && fs.existsSync(localPath)) {
    const filename = path.basename(localPath);
    const meta = readMeta(filename);
    return {
      buffer: fs.readFileSync(localPath),
      mimeType: meta?.mimeType ?? mimeFromFilename(filename),
    };
  }

  const filename = courseAssetUrlToFilename(assetUrl);
  const sql = getSql();
  const rows = await sql`
    SELECT data, mime_type FROM course_assets WHERE filename = ${filename} LIMIT 1
  `;

  if (rows.length === 0 || rows[0].data == null) {
    throw new Error("Asset not found.");
  }

  const buffer = bufferFromDbValue(rows[0].data);
  const mimeType = String(rows[0].mime_type ?? mimeFromFilename(filename));

  try {
    ensureDir();
    fs.writeFileSync(path.join(ASSETS_DIR, filename), buffer);
    writeMeta(filename, {
      mimeType,
      originalName: filename,
      sizeBytes: buffer.length,
    });
  } catch {
    /* disk cache optional */
  }

  return { buffer, mimeType };
}
