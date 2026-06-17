"use client";

import type { ReviewRequest } from "./types";
import { readAll as readAllProgress, writeAll as writeAllProgress } from "./progress-store";
import { logAudit } from "./audit-store";

const REVIEW_STORE_KEY = "compliance-reviews";

// Helper to read review requests
export function getAllReviewRequests(): ReviewRequest[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(REVIEW_STORE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Helper to write review requests
function writeAllReviewRequests(requests: ReviewRequest[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REVIEW_STORE_KEY, JSON.stringify(requests));
}

// Check for pending request
export function getPendingRequest(username: string, moduleId: string): ReviewRequest | null {
  const requests = getAllReviewRequests();
  return requests.find((r) => r.username === username && r.moduleId === moduleId && r.status === "Pending") || null;
}

// Submit review request
export function submitReviewRequest(
  username: string,
  moduleId: string,
  moduleTitle: string,
  warningCount: number,
  failureTimestamp: number,
  userExplanation: string
): ReviewRequest {
  const pending = getPendingRequest(username, moduleId);
  if (pending) {
    throw new Error("A review request is already under review.");
  }

  const requests = getAllReviewRequests();
  const newRequest: ReviewRequest = {
    id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    username,
    moduleId,
    moduleTitle,
    warningCount,
    failureTimestamp,
    userExplanation,
    status: "Pending",
    submittedTimestamp: Date.now(),
  };

  requests.unshift(newRequest);
  writeAllReviewRequests(requests);

  // Log in Audit Trail
  logAudit("Request Submitted", username, `Submitted review request for ${moduleTitle}. Explanation: "${userExplanation}"`);

  return newRequest;
}

// Approve retake request
export function approveReviewRequest(requestId: string, adminUsername: string): void {
  const requests = getAllReviewRequests();
  const reqIndex = requests.findIndex((r) => r.id === requestId);
  if (reqIndex === -1) {
    throw new Error("Review request not found.");
  }

  const request = requests[reqIndex];
  if (request.status !== "Pending") {
    throw new Error("Only pending requests can be approved.");
  }

  // Update progress in progress-store
  const allProgress = readAllProgress();
  const key = `${request.username}|${request.moduleId}`;
  const progress = allProgress[key];

  if (!progress) {
    throw new Error("Assessment progress not found.");
  }

  if ((progress.retakeCount ?? 0) >= 2) {
    // Escalate to permanently failed if somehow reached
    progress.status = "permanently_failed";
    progress.failedReason = "Maximum retake limit reached";
    writeAllProgress(allProgress);
    
    request.status = "Rejected";
    request.decisionTimestamp = Date.now();
    request.rejectedBy = adminUsername;
    request.rejectedAt = Date.now();
    request.adminComment = "Rejected automatically: maximum retake limit reached.";
    writeAllReviewRequests(requests);

    logAudit("Retake Limit Reached", adminUsername, `Retake blocked for ${request.username} on ${request.moduleTitle}. Already had 2 retakes.`);
    throw new Error("Maximum retake limit reached. No further attempts allowed.");
  }

  // Archiving current warnings
  if (!progress.archivedWarnings) {
    progress.archivedWarnings = [];
  }
  progress.archivedWarnings.push({
    attempt: (progress.retakeCount ?? 0) + 1,
    warnings: progress.warningHistory || [],
  });

  // Increment retakeCount and reset progress parameters
  progress.retakeCount = (progress.retakeCount ?? 0) + 1;
  progress.warningCount = 0;
  progress.warningHistory = [];
  progress.currentSlide = 0;
  progress.status = "not_started";
  progress.failedAt = undefined;
  progress.failedReason = undefined;
  
  writeAllProgress(allProgress);

  // Update request decision details
  request.status = "Approved";
  request.decisionTimestamp = Date.now();
  request.approvedBy = adminUsername;
  request.approvedAt = Date.now();

  writeAllReviewRequests(requests);

  // Audits
  logAudit("Request Approved", adminUsername, `Approved retake request for ${request.username} on ${request.moduleTitle}`);
  logAudit("Retake Granted", adminUsername, `Granted Retake #${progress.retakeCount} to ${request.username} for ${request.moduleTitle}`);
  logAudit("Assessment Reset", adminUsername, `Reset progress and warnings for ${request.username} on ${request.moduleTitle} (Set to not_started)`);
}

// Reject request
export function rejectReviewRequest(requestId: string, adminUsername: string, comment?: string): void {
  const requests = getAllReviewRequests();
  const reqIndex = requests.findIndex((r) => r.id === requestId);
  if (reqIndex === -1) {
    throw new Error("Review request not found.");
  }

  const request = requests[reqIndex];
  if (request.status !== "Pending") {
    throw new Error("Only pending requests can be rejected.");
  }

  // Check if we should update progress status to reflect the lockout
  const allProgress = readAllProgress();
  const key = `${request.username}|${request.moduleId}`;
  const progress = allProgress[key];
  if (progress) {
    progress.failedReason = comment || "Review request rejected by administrator.";
    writeAllProgress(allProgress);
  }

  // Update request decision details
  request.status = "Rejected";
  request.decisionTimestamp = Date.now();
  request.rejectedBy = adminUsername;
  request.rejectedAt = Date.now();
  request.adminComment = comment;

  writeAllReviewRequests(requests);

  // Audit
  logAudit("Request Rejected", adminUsername, `Rejected retake request for ${request.username} on ${request.moduleTitle}. Comment: "${comment || "No comment"}"`);
}
