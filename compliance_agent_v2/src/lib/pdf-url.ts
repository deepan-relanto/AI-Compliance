/** Stored DB path e.g. /uploads/{uuid}.pdf → browser URL via authenticated API. */
export function clientPdfUrl(storedUrl: string | null | undefined): string | undefined {
  if (!storedUrl) return undefined;
  if (storedUrl.startsWith("/api/files/")) return storedUrl;
  if (storedUrl.startsWith("/uploads/")) return `/api/files${storedUrl}`;
  return storedUrl;
}
