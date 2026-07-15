import crypto from "crypto";
import fs from "fs";
import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "public", "course-assets");
const MAX_BYTES = 100 * 1024 * 1024;
const ASSET_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

export type CourseAssetKind = "lesson" | "scenarios" | "video" | "mindmap" | "infographic";

const ALLOWED: Record<CourseAssetKind, string[]> = {
  lesson: ["text/html", "application/xhtml+xml"],
  scenarios: ["text/html", "application/xhtml+xml"],
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
  if (kind === "scenarios" && [".html", ".htm"].includes(ext)) return true;
  if (kind === "mindmap" && [".html", ".htm", ".json"].includes(ext)) return true;
  if (kind === "infographic" && [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext)) {
    return true;
  }
  if (kind === "video" && [".mp4", ".webm", ".mov"].includes(ext)) return true;
  return false;
}
/** Store course media on local disk only for local testing. */
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

  return { assetUrl, mimeType: resolvedMime, originalName };
}

/** Read course asset bytes from local disk only. */
export async function getCourseAssetBuffer(assetUrl: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const meta = await getCourseAssetMeta(assetUrl);
  const chunk = await readCourseAssetRange(assetUrl, 0, meta.size - 1);
  return { buffer: chunk.buffer, mimeType: chunk.mimeType };
}

function shouldUseLocalFile(
  localPath: string,
  filename: string,
): boolean {
  if (!fs.existsSync(localPath)) return false;
  const stat = fs.statSync(localPath);
  if (stat.size === 0) return false;
  const diskMeta = readMeta(filename);
  if (diskMeta?.sizeBytes && stat.size < diskMeta.sizeBytes * 0.9) return false;
  return true;
}

export async function getCourseAssetMeta(assetUrl: string): Promise<{
  size: number;
  mimeType: string;
}> {
  const relative = assetUrl.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.normalize(path.join(publicRoot, relative));
  const filename = courseAssetUrlToFilename(assetUrl);

  if (localPath.startsWith(publicRoot) && shouldUseLocalFile(localPath, filename)) {
    const meta = readMeta(filename);
    const stat = fs.statSync(localPath);
    return {
      size: stat.size,
      mimeType: meta?.mimeType ?? mimeFromFilename(filename),
    };
  }

  throw new Error("Asset not found on local disk.");
}

/** Read a byte range from local disk. */
export async function readCourseAssetRange(
  assetUrl: string,
  start: number,
  end: number,
): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
  if (start < 0 || end < start) {
    throw new Error("Invalid byte range.");
  }

  const relative = assetUrl.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.normalize(path.join(publicRoot, relative));
  const filename = courseAssetUrlToFilename(assetUrl);

  if (localPath.startsWith(publicRoot) && shouldUseLocalFile(localPath, filename)) {
    const meta = readMeta(filename);
    const stat = fs.statSync(localPath);
    const safeEnd = Math.min(end, stat.size - 1);
    const length = safeEnd - start + 1;
    const fd = fs.openSync(localPath, "r");
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      return {
        buffer,
        mimeType: meta?.mimeType ?? mimeFromFilename(filename),
        size: stat.size,
      };
    } finally {
      fs.closeSync(fd);
    }
  }
  throw new Error("Asset not found on local disk.");
}
