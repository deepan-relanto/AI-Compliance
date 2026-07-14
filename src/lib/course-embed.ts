/** postMessage protocol between CoursePlayer and embedded HTML lesson / mind map. */

export const COURSE_EMBED_EVENT = "relanto-course-embed";
export const COURSE_EMBED_COMMAND = "relanto-course-command";

export type CourseEmbedKind = "lesson" | "scenarios" | "mindmap";

export type CourseEmbedState = {
  kind: CourseEmbedKind;
  slideIndex: number;
  slideCount: number;
  atEnd: boolean;
  atStart: boolean;
};

export type CourseEmbedCommand =
  | { type: typeof COURSE_EMBED_COMMAND; command: "next" }
  | { type: typeof COURSE_EMBED_COMMAND; command: "prev" }
  | { type: typeof COURSE_EMBED_COMMAND; command: "goto"; index: number };

export function withEmbedQuery(
  url: string | undefined,
  embed = true,
  version?: string | number | null,
): string | undefined {
  if (!url) return undefined;
  let next = url;
  if (embed && !next.includes("embed=1")) {
    const join = next.includes("?") ? "&" : "?";
    next = `${next}${join}embed=1`;
  }
  if (version != null && String(version).length > 0) {
    const v = encodeURIComponent(String(version));
    if (!next.includes(`v=${v}`) && !/[?&]v=/.test(next)) {
      const join = next.includes("?") ? "&" : "?";
      next = `${next}${join}v=${v}`;
    }
  }
  return next;
}

/** Build a cache-bust token from step config so iframe remounts when HTML changes. */
export function courseEmbedVersion(config: {
  contentRevision?: number | null;
  sizeBytes?: number | null;
  pageCount?: number | null;
}): string {
  const rev = config.contentRevision ?? 0;
  const size = config.sizeBytes ?? 0;
  const pages = config.pageCount ?? 0;
  return `${rev}-${size}-${pages}`;
}

export function isCourseEmbedState(data: unknown): data is CourseEmbedState & {
  type: typeof COURSE_EMBED_EVENT;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === COURSE_EMBED_EVENT &&
    (d.kind === "lesson" || d.kind === "scenarios" || d.kind === "mindmap") &&
    typeof d.slideIndex === "number" &&
    typeof d.slideCount === "number" &&
    typeof d.atEnd === "boolean" &&
    typeof d.atStart === "boolean"
  );
}
