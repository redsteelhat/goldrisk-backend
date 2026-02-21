/**
 * Transaction routes - Sale, Purchase
 */

import { Router, Request, Response } from 'express';
import { createSale, createPurchase } from '../services/transaction.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import type { GoldType } from '../services/daily-price.service.js';
import { toTRY } from '../types/decimal.js';

const VALID_GOLD_TYPES: GoldType[] = [
  'HAS',
  '22A',
  '18A',
  '14A',
  '9A',
  'PLATINUM',
  'NONE',
];
const VALID_PAYMENT: string[] = ['cash', 'pos', 'transfer', 'gold_exchange', 'mixed'];

function isGoldType(s: string): s is GoldType {
  return VALID_GOLD_TYPES.includes(s as GoldType);
}
function isPaymentMethod(s: string): boolean {
  return VALID_PAYMENT.includes(s);
}

const router = Router();

router.use(authMiddleware);

/** POST /transactions/sale */
router.post(
  '/sale',
  requireRole('owner', 'manager', 'cashier'),
  (req: Request, res: Response): void => {
    const { gold_item_id, gold_type, customer_id, labor_amount, payment_method, client_request_id, notes } =
      req.body;
    if (!gold_item_id || !gold_type || !payment_method) {
      res.status(400).json({
        error: 'gold_item_id, gold_type, payment_method required',
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!isGoldType(gold_type)) {
      res.status(400).json({ error: 'Invalid gold_type' });
      return;
    }
    if (!isPaymentMethod(payment_method)) {
      res.status(400).json({ error: 'Invalid payment_method' });
      return;
    }

    createSale(
      {
        branch_id: req.user.branch_id,
        gold_item_id,
        customer_id,
        labor_amount: labor_amount != null ? toTRY(labor_amount) : undefined,
        payment_method,
        client_request_id,
        notes,
      },
      gold_type,
      req.user.id
    )
      .then(({ id }) => res.status(201).json({ id }))
      .catch((err) => res.status(400).json({ error: err.message }));
  }
);

/** POST /transactions/purchase */
router.post(
  '/purchase',
  requireRole('owner', 'manager', 'cashier'),
  (req: Request, res: Response): void => {
    const {
      product_id,
      gold_type,
      quantity_g,
      unit_price_g,
      labor_amount,
      payment_method,
      client_request_id,
      notes,
    } = req.body;
    if (
      !product_id ||
      !gold_type ||
      quantity_g == null ||
      unit_price_g == null ||
      !payment_method
    ) {
      res.status(400).json({
        error: 'product_id, gold_type, quantity_g, unit_price_g, payment_method required',
      });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!isGoldType(gold_type)) {
      res.status(400).json({ error: 'Invalid gold_type' });
      return;
    }
    if (!isPaymentMethod(payment_method)) {
      res.status(400).json({ error: 'Invalid payment_method' });
      return;
    }

    createPurchase(
      {
        branch_id: req.user.branch_id,
        product_id,
        quantity_g,
        unit_price_g: toTRY(unit_price_g),
        labor_amount: labor_amount != null ? toTRY(labor_amount) : undefined,
        payment_method,
        client_request_id,
        notes,
      },
      gold_type,
      req.user.id
    )
      .then(({ id }) => res.status(201).json({ id }))
      .catch((err) => res.status(400).json({ error: err.message }));
  }
);

export default router;
