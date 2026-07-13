/**
 * @deprecated Use db-fix-batch-sync.mjs — syncs progress to users.batch_id without hardcoding teams.
 * Kept for reference only; redirects to batch sync.
 */
console.error(
  "❌ db-fix-team3-progress.mjs is deprecated — it hard-coded relanto_team_3 and caused roster drift.",
);
console.error("   Run: node scripts/db-fix-batch-sync.mjs");
process.exit(1);
