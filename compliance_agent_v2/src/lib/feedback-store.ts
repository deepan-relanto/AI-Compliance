/**
 * feedback-store.ts — client-side feedback with DB sync
 */

export interface FeedbackEntry {
  id: string;
  userId: string;
  userName: string;
  assessmentId: string;
  assessmentName: string;
  feedbackText: string;
  createdAt: number;
  batchId?: string | null;
  batchLabel?: string | null;
}

const STORE_KEY = "compliance-feedback";

function readAll(): FeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: FeedbackEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function submitFeedback(
  userId: string,
  assessmentId: string,
  assessmentName: string,
  feedbackText: string,
  batchId?: string,
): FeedbackEntry {
  const entry: FeedbackEntry = {
    id: generateId(),
    userId,
    userName: userId,
    assessmentId,
    assessmentName,
    feedbackText: feedbackText.trim(),
    createdAt: Date.now(),
    batchId: batchId ?? null,
  };

  const existing = readAll();
  writeAll([entry, ...existing]);

  // Fire-and-forget DB sync
  fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: entry.id,
      userId: entry.userId,
      userName: entry.userName,
      assessmentId: entry.assessmentId,
      assessmentName: entry.assessmentName,
      feedbackText: entry.feedbackText,
    }),
  }).catch(() => undefined);

  return entry;
}

export function getAllFeedback(): FeedbackEntry[] {
  return readAll();
}

export function getFeedbackForAssessment(assessmentId: string): FeedbackEntry[] {
  return readAll().filter((e) => e.assessmentId === assessmentId);
}

/** Parse optional [Rating: X/5] prefix from feedback text */
export function parseRating(text: string): { rating: number | null; body: string } {
  const match = text.match(/^\[Rating:\s*(\d)\/5\]\s*/);
  if (!match) return { rating: null, body: text };
  return {
    rating: Number(match[1]),
    body: text.slice(match[0].length),
  };
}
