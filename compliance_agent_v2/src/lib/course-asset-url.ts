import { clientPdfUrl } from "@/lib/pdf-url";

/** Resolve stored asset paths for browser playback via authenticated API (survives Render redeploys). */
export function clientCourseAssetUrl(
  storedUrl: string | null | undefined,
): string | undefined {
  if (!storedUrl) return undefined;
  if (storedUrl.startsWith("/api/files/")) return storedUrl;
  if (storedUrl.startsWith("/course-assets/")) return `/api/files${storedUrl}`;
  return clientPdfUrl(storedUrl) ?? storedUrl;
}
