/**
 * Transfer routes - şube arası stok transferi
 */

import { Router, Request, Response } from 'express';
import {
  createTransferRequest,
  approveTransfer,
  receiveTransfer,
} from '../services/transfer.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole, requireOwnerOrManager } from '../middleware/rbac.js';

const router = Router();

router.use(authMiddleware);

/** POST /transfers - transfer talebi oluştur */
router.post(
  '/',
  requireRole('owner', 'manager', 'cashier'),
  (req: Request, res: Response): void => {
    const { target_branch_id, gold_item_id } = req.body;
    if (!target_branch_id || !gold_item_id) {
      res.status(400).json({ error: 'target_branch_id, gold_item_id required' });
      return;
    }
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    createTransferRequest(
      {
        source_branch_id: req.user.branch_id,
        target_branch_id,
        gold_item_id,
      },
      req.user.id
    )
      .then(({ id }) => res.status(201).json({ id }))
      .catch((err) => res.status(400).json({ error: err.message }));
  }
);

/** POST /transfers/:id/approve - source branch onayı */
router.post(
  '/:id/approve',
  requireOwnerOrManager,
  (req: Request<{ id: string }>, res: Response): void => {
    const { id } = req.params;
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    approveTransfer(id, req.user.branch_id, req.user.id)
      .then(({ id: txnId }) => res.status(200).json({ id: txnId }))
      .catch((err) => res.status(400).json({ error: err.message }));
  }
);

/** POST /transfers/:id/receive - target branch teslim alma */
router.post(
  '/:id/receive',
  requireRole('owner', 'manager', 'cashier'),
  (req: Request<{ id: string }>, res: Response): void => {
    const { id } = req.params;
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    receiveTransfer(id, req.user.branch_id, req.user.id)
      .then(({ id: txnId }) => res.status(200).json({ id: txnId }))
      .catch((err) => res.status(400).json({ error: err.message }));
  }
);

export default router;
