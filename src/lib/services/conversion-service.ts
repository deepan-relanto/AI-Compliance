/**
 * conversion-service.ts
 *
 * PDF-only upload pipeline.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storePdfInDatabase } from "@/lib/services/pdf-storage-service";

/** 50 MB upload limit */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const PDF_MIME_TYPES = ["application/pdf"];
export const PDF_EXTENSIONS = [".pdf"];

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

export interface ConversionResult {
  ok: true;
  pdfUrl: string;
  pdfPath: string;
  originalName: string;
  pageCount: number;
}

export interface ConversionError {
  ok: false;
  code: "INVALID_TYPE" | "FILE_TOO_LARGE" | "STORAGE_ERROR";
  message: string;
}

export type ConversionOutcome = ConversionResult | ConversionError;

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function countPdfPages(pdfPath: string): number {
  try {
    const stat = fs.statSync(pdfPath);
    const chunkSize = Math.min(2048, stat.size);
    const buffer = Buffer.alloc(chunkSize);
    const fd = fs.openSync(pdfPath, "r");
    fs.readSync(fd, buffer, 0, chunkSize, stat.size - chunkSize);
    fs.closeSync(fd);

    const tail = buffer.toString("latin1");
    const matches = [...tail.matchAll(/\/Count\s+(\d+)/g)];
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      const count = parseInt(last[1], 10);
      if (!isNaN(count) && count > 0) return count;
    }

    const full = fs.readFileSync(pdfPath, "latin1");
    const allMatches = [...full.matchAll(/\/Count\s+(\d+)/g)];
    if (allMatches.length > 0) {
      const max = Math.max(...allMatches.map((m) => parseInt(m[1], 10)));
      if (!isNaN(max) && max > 0) return max;
    }
  } catch (err) {
    console.warn("[conversion-service] Could not count PDF pages:", err);
  }
  return 1;
}

export async function storePdfUpload(
  buffer: Buffer,
  originalName: string,
  _mimeType: string,
  sizeBytes: number,
): Promise<ConversionOutcome> {
  const ext = path.extname(originalName).toLowerCase();

  if (ext !== ".pdf") {
    return {
      ok: false,
      code: "INVALID_TYPE",
      message: "Only .pdf files are accepted.",
    };
  }

  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `File exceeds the 50 MB limit (received ${(sizeBytes / 1024 / 1024).toFixed(1)} MB).`,
    };
  }

  try {
    ensureUploadsDir();
    const finalPdfName = `${crypto.randomUUID()}.pdf`;
    const finalPdfPath = path.join(UPLOADS_DIR, finalPdfName);
    fs.writeFileSync(finalPdfPath, buffer);
    const pdfUrl = `/uploads/${finalPdfName}`;
    await storePdfInDatabase(pdfUrl, buffer);

    const pageCount = countPdfPages(finalPdfPath);

    return {
      ok: true,
      pdfUrl,
      pdfPath: finalPdfPath,
      originalName,
      pageCount,
    };
  } catch (err) {
    console.error("[conversion-service] PDF storage error:", err);
    return {
      ok: false,
      code: "STORAGE_ERROR",
      message: "Failed to save the PDF. Check server storage permissions.",
    };
  }
}

export function isPdfUpload(originalName: string, mimeType: string): boolean {
  const ext = path.extname(originalName).toLowerCase();
  return PDF_EXTENSIONS.includes(ext) || PDF_MIME_TYPES.includes(mimeType);
}
