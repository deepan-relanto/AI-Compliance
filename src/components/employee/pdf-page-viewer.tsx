"use client";

/**
 * PdfPageViewer — client-only PDF renderer (react-pdf / pdfjs-dist).
 * Loads the document once; only the page canvas updates when pageNumber changes.
 */

import { clientPdfUrl } from "@/lib/pdf-url";
import { Loader2, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

const PDFJS_VERSION = pdfjs.version;
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/standard_fonts/`,
} as const;

/** Typical PowerPoint export — used until the page reports its real size. */
const DEFAULT_SLIDE_ASPECT = 16 / 9;

interface PdfPageViewerProps {
  pdfUrl: string;
  pageNumber: number;
  onLoadSuccess: (numPages: number) => void;
}

function fitPageWidth(
  containerWidth: number,
  containerHeight: number,
  pageAspect: number,
): number {
  if (containerWidth <= 0 || containerHeight <= 0 || pageAspect <= 0) return 0;
  const maxWidthFromHeight = containerHeight * pageAspect;
  return Math.floor(Math.min(containerWidth, maxWidthFromHeight));
}

export function PdfPageViewer({
  pdfUrl,
  pageNumber,
  onLoadSuccess,
}: PdfPageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLoadSuccessRef = useRef(onLoadSuccess);
  const mountedRef = useRef(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [pageAspect, setPageAspect] = useState(DEFAULT_SLIDE_ASPECT);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [pageRendering, setPageRendering] = useState(true);
  const [docKey, setDocKey] = useState(0);

  useEffect(() => {
    onLoadSuccessRef.current = onLoadSuccess;
  }, [onLoadSuccess]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        setContainerWidth((prev) => (Math.abs(prev - w) > 2 ? w : prev));
        setContainerHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setNumPages(null);
    setDocError(null);
    setPageRendering(true);
    setPageAspect(DEFAULT_SLIDE_ASPECT);
    setDocKey((k) => k + 1);
  }, [pdfUrl]);

  useEffect(() => {
    if (numPages == null) return;
    setPageRendering(true);
    setPageAspect(DEFAULT_SLIDE_ASPECT);
  }, [pageNumber, numPages]);

  const handleDocLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    if (!mountedRef.current) return;
    setDocError(null);
    setNumPages(total);
    onLoadSuccessRef.current(total);
  }, []);

  const handleDocLoadError = useCallback((err: Error) => {
    console.warn("[PdfPageViewer] Failed to load PDF:", err);
    if (!mountedRef.current) return;
    setDocError(
      "Unable to load the PDF. It may have been removed — contact your administrator.",
    );
    setPageRendering(false);
  }, []);

  const handlePageLoadSuccess = useCallback((page: { width: number; height: number }) => {
    if (!mountedRef.current) return;
    if (page.width > 0 && page.height > 0) {
      setPageAspect(page.width / page.height);
    }
  }, []);

  const handlePageRenderSuccess = useCallback(() => {
    if (!mountedRef.current) return;
    setPageRendering(false);
  }, []);

  const handlePageRenderError = useCallback((err: Error) => {
    console.warn("[PdfPageViewer] Page render error:", err);
    if (!mountedRef.current) return;
    setPageRendering(false);
    const msg = String(err?.message ?? err);
    if (msg.includes("Transport") || msg.includes("sendWithPromise") || msg.includes("destroyed")) {
      setNumPages(null);
      setDocKey((k) => k + 1);
    }
  }, []);

  const file = useMemo(
    () => ({
      url: clientPdfUrl(pdfUrl) ?? pdfUrl,
      withCredentials: true as const,
    }),
    [pdfUrl],
  );
  const docLoading = numPages === null && !docError;
  const pageWidth = useMemo(
    () => fitPageWidth(containerWidth, containerHeight, pageAspect),
    [containerWidth, containerHeight, pageAspect],
  );

  const canRenderPage =
    numPages != null && pageNumber >= 1 && pageNumber <= numPages && pageWidth > 0;

  if (docError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" strokeWidth={1.5} />
        <p className="max-w-xs text-sm text-zinc-500">{docError}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden"
    >
      {(docLoading || pageRendering) && (
        <div
          className={`absolute inset-0 z-10 flex items-center justify-center ${
            docLoading ? "bg-zinc-900/60" : "bg-zinc-900/20"
          }`}
        >
          <Loader2 className="h-6 w-6 animate-spin text-[#f15a24]" />
        </div>
      )}

      {pageWidth > 0 && (
        <Document
          key={`${file.url}-${docKey}`}
          file={file}
          options={PDF_DOCUMENT_OPTIONS}
          onLoadSuccess={handleDocLoadSuccess}
          onLoadError={handleDocLoadError}
          loading={null}
          error={null}
        >
          {canRenderPage && (
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              onLoadSuccess={handlePageLoadSuccess}
              onRenderSuccess={handlePageRenderSuccess}
              onRenderError={handlePageRenderError}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="shadow-2xl ring-1 ring-black/25"
            />
          )}
        </Document>
      )}
    </div>
  );
}
