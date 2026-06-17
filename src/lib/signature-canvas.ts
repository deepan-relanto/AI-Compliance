/** Validates a legal name for typed e-signature attestation. */
export function isValidSignatureName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  return /^[\p{L}\p{M}'.\-\s]+$/u.test(trimmed);
}

export function normalizeSignatureName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Renders the typed name as a PNG data URL for attestation storage.
 */
export async function renderTypedSignaturePng(
  name: string,
  fontFamily: string,
): Promise<string | null> {
  const normalized = normalizeSignatureName(name);
  if (!isValidSignatureName(normalized)) return null;

  if (typeof document !== "undefined" && document.fonts?.load) {
    const probe = `64px ${fontFamily}`;
    try {
      await document.fonts.load(probe, normalized);
      await document.fonts.ready;
    } catch {
      /* proceed with fallback if font load fails */
    }
  }

  const canvas = document.createElement("canvas");
  const width = 720;
  const height = 200;
  const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(dpr, dpr);

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#f8fafc");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const len = normalized.length;
  const fontSize = len > 34 ? 40 : len > 26 ? 48 : len > 18 ? 56 : 64;
  const ink = ctx.createLinearGradient(0, 0, width, 0);
  ink.addColorStop(0, "#1e3a5f");
  ink.addColorStop(0.5, "#2e3192");
  ink.addColorStop(1, "#1e3a5f");
  ctx.fillStyle = ink;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(30, 58, 95, 0.12)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillText(normalized, width / 2, height / 2 - 6);
  ctx.shadowColor = "transparent";

  const lineY = height - 44;
  const lineGrad = ctx.createLinearGradient(56, lineY, width - 56, lineY);
  lineGrad.addColorStop(0, "rgba(203, 213, 225, 0)");
  lineGrad.addColorStop(0.15, "rgba(148, 163, 184, 0.9)");
  lineGrad.addColorStop(0.85, "rgba(148, 163, 184, 0.9)");
  lineGrad.addColorStop(1, "rgba(203, 213, 225, 0)");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(56, lineY);
  ctx.lineTo(width - 56, lineY);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = '10px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("ELECTRONIC SIGNATURE", width / 2, lineY + 20);

  return canvas.toDataURL("image/png");
}
