/**
 * Remove legacy .next junction (AppData cache broke react/next module resolution).
 * Keeps a normal project-local .next folder.
 */
import fs from "fs";
import path from "path";

const nextLink = path.join(process.cwd(), ".next");

function isReparsePoint(p) {
  try {
    const stat = fs.lstatSync(p);
    return stat.isSymbolicLink() || (stat.mode & 0o170000) === 0o120000;
  } catch {
    return false;
  }
}

if (fs.existsSync(nextLink) && isReparsePoint(nextLink)) {
  fs.rmSync(nextLink, { recursive: true, force: true });
  console.log("[ensure-next-in-project] Removed .next junction.");
}

const legacyCache = path.join(
  process.env.LOCALAPPDATA ?? "",
  "compliance-agent-next",
);
if (legacyCache && fs.existsSync(legacyCache)) {
  fs.rmSync(legacyCache, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  console.log("[ensure-next-in-project] Cleared legacy AppData build cache.");
}
