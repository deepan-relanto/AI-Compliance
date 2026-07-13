import type { ReviewRequest } from "@/lib/types";

export async function fetchLatestReviewRequest(
  username: string,
  moduleId: string,
): Promise<ReviewRequest | null> {
  const params = new URLSearchParams({ username, moduleId });
  const res = await fetch(`/api/reviews?${params}`);
  const data = await res.json();
  if (!res.ok || !data.ok) return null;
  return data.request ?? null;
}

export async function submitReviewRequestApi(input: {
  username: string;
  moduleId: string;
  moduleTitle: string;
  warningCount: number;
  failureTimestamp: number;
  userExplanation: string;
}): Promise<ReviewRequest> {
  const res = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to submit review request.");
  }
  return data.request as ReviewRequest;
}

export async function approveReviewRequestApi(
  requestId: string,
  adminUsername: string,
): Promise<void> {
  const res = await fetch(`/api/reviews/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", adminUsername }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to approve request.");
  }
}

export async function rejectReviewRequestApi(
  requestId: string,
  adminUsername: string,
  comment: string,
): Promise<void> {
  const res = await fetch(`/api/reviews/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", adminUsername, comment }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to reject request.");
  }
}

export async function fetchLatestCourseReviewRequest(
  username: string,
  moduleId: string,
): Promise<ReviewRequest | null> {
  const params = new URLSearchParams({ username, moduleId });
  const res = await fetch(`/api/course-reviews?${params}`);
  const data = await res.json();
  if (!res.ok || !data.ok) return null;
  return data.request ?? null;
}

export async function submitCourseReviewRequestApi(input: {
  username: string;
  moduleId: string;
  moduleTitle: string;
  warningCount: number;
  failureTimestamp: number;
  userExplanation: string;
}): Promise<ReviewRequest> {
  const res = await fetch("/api/course-reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to submit review request.");
  }
  return data.request as ReviewRequest;
}

export async function approveCourseReviewRequestApi(
  requestId: string,
  adminUsername: string,
): Promise<void> {
  const res = await fetch(`/api/course-reviews/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve", adminUsername }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to approve request.");
  }
}

export async function rejectCourseReviewRequestApi(
  requestId: string,
  adminUsername: string,
  comment: string,
): Promise<void> {
  const res = await fetch(`/api/course-reviews/${encodeURIComponent(requestId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", adminUsername, comment }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "Failed to reject request.");
  }
}
