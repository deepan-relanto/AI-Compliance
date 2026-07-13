import sharp from "sharp";

export const SCORE_RING_IMAGE_CID = "complianceScoreRing";

export function buildScoreRingSvg(scorePercent: number, passed: boolean): string {
  const clamped = Math.min(100, Math.max(0, Math.round(scorePercent)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;
  const trackColor = "#e4e4e7";
  const progressColor = passed ? "#059669" : "#dc2626";
  const scoreColor = passed ? "#047857" : "#b91c1c";
  const statusLabel = passed ? "PASS" : "FAIL";
  const statusColor = "#71717a";
  const bgColor = passed ? "#ecfdf5" : "#fef2f2";
  const circ = circumference.toFixed(2);
  const offset = dashOffset.toFixed(2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 112 112" xmlns="http://www.w3.org/2000/svg">
  <rect width="112" height="112" fill="${bgColor}" rx="56"/>
  <g transform="rotate(-90 56 56)">
    <circle cx="56" cy="56" r="${radius}" fill="none" stroke="${trackColor}" stroke-width="10"/>
    <circle cx="56" cy="56" r="${radius}" fill="none" stroke="${progressColor}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
  </g>
  <text x="56" y="53" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" fill="${scoreColor}">${clamped}%</text>
  <text x="56" y="69" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="9" font-weight="600" fill="${statusColor}" letter-spacing="1.2">${statusLabel}</text>
</svg>`;
}

export async function buildScoreRingPngBuffer(
  scorePercent: number,
  passed: boolean,
): Promise<Buffer> {
  const svg = buildScoreRingSvg(scorePercent, passed);
  return sharp(Buffer.from(svg)).png().resize(256, 256).toBuffer();
}
