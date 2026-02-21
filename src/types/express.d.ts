/**
 * Express Request extension for GoldRisk auth
 */

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        branch_id: string;
        email: string;
        full_name: string;
        role: 'owner' | 'manager' | 'cashier' | 'auditor';
        is_headquarter: boolean;
      };
    }
  }
}

export {};
