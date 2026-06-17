/** Parse HR CSV dates like 16-May-1967 or 01-Feb-2021 → YYYY-MM-DD */
export function parseHrDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;

  const m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mon = months[m[2].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  const day = m[1].padStart(2, "0");
  return `${m[3]}-${mon}-${day}`;
}

export function slugifyBatchId(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  const suffix = Date.now().toString(36).slice(-4);
  return base ? `${base}_${suffix}` : `batch_${suffix}`;
}
