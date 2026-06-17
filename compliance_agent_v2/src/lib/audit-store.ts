"use client";

import type { AuditLogEntry } from "./types";

const AUDIT_STORE_KEY = "compliance-audit";

// Helper to read audit logs
export function getAllAuditLogs(): AuditLogEntry[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(AUDIT_STORE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// Helper to write audit logs
function writeAllAuditLogs(logs: AuditLogEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUDIT_STORE_KEY, JSON.stringify(logs));
}

// Log audit action
export function logAudit(action: string, admin: string, details?: string): void {
  const logs = getAllAuditLogs();
  const entry: AuditLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    action,
    admin,
    timestamp: Date.now(),
    details,
  };
  logs.unshift(entry); // Newest first
  writeAllAuditLogs(logs);
}
