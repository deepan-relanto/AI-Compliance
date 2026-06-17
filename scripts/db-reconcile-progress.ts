/**
 * Run progress reconciliation (scores + completion status fixes).
 * Usage: npm run db:reconcile-progress
 */
import { getSql } from "../src/lib/db";
import { reconcileAllProgress } from "../src/lib/services/progress-db-service";

const sql = getSql();
const result = await reconcileAllProgress(sql);
console.log(
  `✅ Reconcile complete — scores fixed: ${result.scoresFixed}, status fixed: ${result.statusFixed}`,
);
