/**
 * PostgreSQL connection pool
 */

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export type UserRole = 'owner' | 'manager' | 'cashier' | 'auditor';

export interface AuthUser {
  id: string;
  branch_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_headquarter: boolean;
}

export default pool;
