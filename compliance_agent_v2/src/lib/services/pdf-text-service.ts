import { getPdfBuffer } from "@/lib/services/pdf-storage-service";

/** Extract plain text per page from a stored PDF (disk or database). */
export async function extractPdfPagesText(pdfUrl: string): Promise<string[]> {
  const buffer = await getPdfBuffer(pdfUrl);
  const data = new Uint8Array(buffer);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs
    .getDocument({
      data,
      useSystemFonts: true,
      verbosity: (pdfjs as { VerbosityLevel?: { ERRORS?: number } }).VerbosityLevel?.ERRORS ?? 0,
    })
    .promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(text);
  }

  return pages;
}

/** Pages [from..to] inclusive, 1-based slide indices. */
export function chunkPagesForGate(
  pages: string[],
  gateSlide: number,
  windowSize = 3,
): { slideFrom: number; slideTo: number; excerpt: string } {
  const slideTo = Math.min(gateSlide, pages.length);
  const slideFrom = Math.max(1, slideTo - windowSize + 1);
  const excerpt = pages
    .slice(slideFrom - 1, slideTo)
    .map((t, i) => `[Slide ${slideFrom + i}]\n${t || "(no text)"}`)
    .join("\n\n");
  return { slideFrom, slideTo, excerpt };
}
