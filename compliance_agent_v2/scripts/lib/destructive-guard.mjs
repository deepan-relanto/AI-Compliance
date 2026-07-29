/**
 * Guard for destructive DB wipe scripts.
 * Default (no flags): warn and exit 1.
 * --dry-run: preview only (wins over --confirm).
 * --confirm: execute deletions.
 */
export function requireDestructiveConfirm(scriptName, { description } = {}) {
  const args = process.argv.slice(2);
  const hasDryRun = args.includes("--dry-run");
  const hasConfirm = args.includes("--confirm");

  if (hasDryRun) {
    return { dryRun: true, confirm: false };
  }
  if (hasConfirm) {
    return { dryRun: false, confirm: true };
  }

  console.error(`\n⚠️  WARNING: Destructive script "${scriptName}"`);
  if (description) {
    console.error(description);
  }
  console.error("\nThis script deletes or modifies database data.");
  console.error("Pass --dry-run to preview counts without making changes.");
  console.error("Pass --confirm to execute deletions.\n");
  console.error(`Usage: node scripts/${scriptName} --dry-run`);
  console.error(`       node scripts/${scriptName} --confirm\n`);
  process.exit(1);
}
