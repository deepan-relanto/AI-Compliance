/** postMessage protocol between CoursePlayer and embedded HTML lesson / mind map. */

export const COURSE_EMBED_EVENT = "relanto-course-embed";
export const COURSE_EMBED_COMMAND = "relanto-course-command";

export type CourseEmbedKind = "lesson" | "mindmap";

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
): string | undefined {
  if (!url) return undefined;
  if (!embed) return url;
  if (url.includes("embed=1")) return url;
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}embed=1`;
}

export function isCourseEmbedState(data: unknown): data is CourseEmbedState & {
  type: typeof COURSE_EMBED_EVENT;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.type === COURSE_EMBED_EVENT &&
    (d.kind === "lesson" || d.kind === "mindmap") &&
    typeof d.slideIndex === "number" &&
    typeof d.slideCount === "number" &&
    typeof d.atEnd === "boolean" &&
    typeof d.atStart === "boolean"
  );
}
