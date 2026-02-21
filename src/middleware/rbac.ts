/**
 * RBAC middleware
 * owner: tüm işlemler, cross-branch
 * manager: approval, backdated, adjustment
 * cashier: sadece bugün, satış/alış
 * auditor: salt okuma, AuditLog
 */

import { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../lib/db.js';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (roles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Forbidden', required: roles });
  };
}

export function requireOwnerOrManager(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.user.role === 'owner' || req.user.role === 'manager') {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden', required: ['owner', 'manager'] });
}

export function requireOwner(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (req.user.role === 'owner') {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden', required: ['owner'] });
}
