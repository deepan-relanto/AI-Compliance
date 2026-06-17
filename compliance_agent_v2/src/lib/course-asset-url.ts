import { clientPdfUrl } from "@/lib/pdf-url";

/** Resolve stored asset paths for browser playback (local public files or API PDFs). */
export function clientCourseAssetUrl(
  storedUrl: string | null | undefined,
): string | undefined {
  if (!storedUrl) return undefined;
  if (storedUrl.startsWith("/course-assets/")) return storedUrl;
  return clientPdfUrl(storedUrl) ?? storedUrl;
}
