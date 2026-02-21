/**
 * Gece job: Günlük stock_snapshot (00:00)
 * Cron ile çalıştır: 0 0 * * * node dist/scripts/job-stock-snapshot.js
 * veya: npm run job:snapshot
 */

import 'dotenv/config';
import { takeStockSnapshot } from '../src/services/reconciliation.service.js';

async function main(): Promise<void> {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  console.log(`[job-stock-snapshot] Starting snapshot for ${date}`);
  const { inserted } = await takeStockSnapshot(date);
  console.log(`[job-stock-snapshot] Done. inserted=${inserted}`);
}

main().catch((err) => {
  console.error('[job-stock-snapshot] Error:', err);
  process.exit(1);
});
