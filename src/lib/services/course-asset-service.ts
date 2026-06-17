import crypto from "crypto";
import fs from "fs";
import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "public", "course-assets");
const MAX_BYTES = 100 * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  video: ["video/mp4", "video/webm", "video/quicktime"],
  mindmap: ["application/json"],
  infographic: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
};

const EXT_BY_MIME: Record<string, string> = {
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

export function isAllowedCourseAsset(
  kind: "video" | "mindmap" | "infographic",
  mimeType: string,
  fileName: string,
): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const allowed = ALLOWED[kind];
  if (allowed.includes(mimeType)) return true;
  if (kind === "mindmap" && ext === ".json") return true;
  if (kind === "infographic" && [".png", ".jpg", ".jpeg", ".webp", ".pdf"].includes(ext)) {
    return true;
  }
  if (kind === "video" && [".mp4", ".webm", ".mov"].includes(ext)) return true;
  return false;
}

/** Store course media on local disk only — no database blob storage. */
export async function storeCourseAsset(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  kind: "video" | "mindmap" | "infographic",
): Promise<{ assetUrl: string; mimeType: string; originalName: string }> {
  if (buffer.length > MAX_BYTES) {
    throw new Error("File exceeds the 100 MB limit.");
  }
  if (!isAllowedCourseAsset(kind, mimeType, originalName)) {
    throw new Error(`Invalid file type for ${kind}.`);
  }

  ensureDir();
  const ext =
    path.extname(originalName).toLowerCase() ||
    EXT_BY_MIME[mimeType] ||
    ".bin";
  const filename = `${crypto.randomUUID()}${ext}`;
  const assetUrl = `/course-assets/${filename}`;
  const filePath = path.join(ASSETS_DIR, filename);

  fs.writeFileSync(filePath, buffer);
  writeMeta(filename, {
    mimeType: mimeType || mimeFromFilename(filename),
    originalName,
    sizeBytes: buffer.length,
  });

  return { assetUrl, mimeType: mimeType || mimeFromFilename(filename), originalName };
}

export async function getCourseAssetBuffer(assetUrl: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  const relative = assetUrl.replace(/^\//, "");
  const publicRoot = path.join(process.cwd(), "public");
  const localPath = path.normalize(path.join(publicRoot, relative));

  if (!localPath.startsWith(publicRoot) || !fs.existsSync(localPath)) {
    throw new Error("Asset not found.");
  }

  const filename = path.basename(localPath);
  const meta = readMeta(filename);
  return {
    buffer: fs.readFileSync(localPath),
    mimeType: meta?.mimeType ?? mimeFromFilename(filename),
  };
}
