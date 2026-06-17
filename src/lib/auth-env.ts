/** Read env vars (tolerates spaces around `=` in .env). */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim();
  }
  const key = Object.keys(process.env).find(
    (k) => k.trim() === name || k.replace(/\s+/g, "") === name.replace(/\s+/g, ""),
  );
  if (!key) return undefined;
  const value = process.env[key];
  return value != null ? String(value).trim() : undefined;
}

export const RELANTO_EMAIL_DOMAINS = ["relanto.ai", "relanto.com"] as const;

export function isRelantoEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return RELANTO_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

/** e.g. gudivaka.vennela@relanto.ai → Gudivaka */
export function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const segment = local.split(".")[0] ?? local;
  if (!segment) return "Learner";
  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}
