/**
 * DailyPrice routes
 */

import { Router, Request, Response } from 'express';
import {
  createPrice,
  getLatestPrice,
  createBackdatedPrice,
  type GoldType,
  type CreatePriceInput,
} from '../services/daily-price.service.js';
import { logDailyPriceInsert } from '../services/audit.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireOwnerOrManager } from '../middleware/rbac.js';
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

function isGoldType(s: string): s is GoldType {
  return VALID_GOLD_TYPES.includes(s as GoldType);
}

const router = Router();

/** Tüm route'lar auth + owner/manager gerekli (fiyat girişi) */
router.use(authMiddleware);
router.use(requireOwnerOrManager);

/** GET /prices/latest/:goldType - En güncel fiyat */
router.get(
  '/latest/:goldType',
  (req: Request<{ goldType: string }>, res: Response): void => {
    const { goldType } = req.params;
    if (!isGoldType(goldType)) {
      res.status(400).json({ error: 'Invalid gold_type', valid: VALID_GOLD_TYPES });
      return;
    }
    getLatestPrice(goldType)
      .then((row) => {
        if (!row) {
          res.status(404).json({ error: `No price for gold_type=${goldType}` });
          return;
        }
        res.json(row);
      })
      .catch((err) => {
        res.status(500).json({ error: err.message });
      });
  }
);

/** POST /prices - Yeni fiyat kaydı (INSERT-only) */
router.post('/', (req: Request, res: Response): void => {
  const { gold_type, buy_price, sell_price, source } = req.body;
  if (!gold_type || buy_price == null || sell_price == null || !source) {
    res.status(400).json({
      error: 'gold_type, buy_price, sell_price, source required',
    });
    return;
  }
  if (!isGoldType(gold_type)) {
    res.status(400).json({ error: 'Invalid gold_type', valid: VALID_GOLD_TYPES });
    return;
  }

  const input: CreatePriceInput = {
    gold_type,
    buy_price: toTRY(buy_price),
    sell_price: toTRY(sell_price),
    source,
    recorded_by: req.user?.id,
  };

  createPrice(input)
    .then(async (row) => {
      if (req.user) {
        await logDailyPriceInsert(
          req.user.id,
          req.user.branch_id,
          row.id,
          row.gold_type,
          String(row.buy_price),
          String(row.sell_price),
          row.is_backdated ?? false
        );
      }
      res.status(201).json(row);
    })
    .catch((err) => res.status(400).json({ error: err.message }));
});

/** POST /prices/backdated - Geriye dönük fiyat düzeltmesi */
router.post('/backdated', (req: Request, res: Response): void => {
  const { gold_type, buy_price, sell_price, source, original_price_id } =
    req.body;
  if (
    !gold_type ||
    buy_price == null ||
    sell_price == null ||
    !source ||
    !original_price_id
  ) {
    res.status(400).json({
      error:
        'gold_type, buy_price, sell_price, source, original_price_id required',
    });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!isGoldType(gold_type)) {
    res.status(400).json({ error: 'Invalid gold_type', valid: VALID_GOLD_TYPES });
    return;
  }

  const input: CreatePriceInput & { original_price_id: string } = {
    gold_type,
    buy_price: toTRY(buy_price),
    sell_price: toTRY(sell_price),
    source,
    original_price_id,
    recorded_by: req.user.id,
  };

  createBackdatedPrice(input, req.user.id)
    .then(async (row) => {
      await logDailyPriceInsert(
        req.user!.id,
        req.user!.branch_id,
        row.id,
        row.gold_type,
        String(row.buy_price),
        String(row.sell_price),
        true
      );
      res.status(201).json(row);
    })
    .catch((err) => res.status(400).json({ error: err.message }));
});

export default router;
