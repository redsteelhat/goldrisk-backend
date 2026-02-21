/**
 * Seed: branch + owner user
 * Usage: npm run db:seed
 * Varsiyel şifre: admin123 (bcrypt)
 */

import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcrypt';

async function seed(): Promise<void> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();

    const { rows: branchRows } = await client.query(
      `INSERT INTO branch (name, code, is_headquarter) VALUES ('Merkez', 'HQ-001', true)
       ON CONFLICT (code) DO NOTHING RETURNING id`
    );

    let branchId = branchRows[0]?.id;
    if (!branchId) {
      const r = await client.query(`SELECT id FROM branch WHERE code = 'HQ-001'`);
      branchId = r.rows[0].id;
    }

    const hash = await bcrypt.hash('admin123', 12);

    await client.query(
      `INSERT INTO "user" (branch_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'Admin', 'owner')
       ON CONFLICT (email) DO NOTHING`,
      [branchId, 'admin@goldrisk.local', hash]
    );

    console.log('Seed OK. Login: admin@goldrisk.local / admin123');
  } finally {
    await client.end();
  }
}

seed().catch(console.error);
