import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { sendError } from '../utils/response';

type PortalAccess = 'bgc' | 'paymentHistory';

export function authorizePortalAccess(access: PortalAccess) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required');
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    if (req.user.role !== 'AGENT') {
      return sendError(res, 403, 'Forbidden');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        role: true,
        isActive: true,
        canAccessBgc: true,
        canAccessPaymentHistory: true,
      },
    });

    if (!user?.isActive) {
      return sendError(res, 401, 'Authentication required');
    }

    if (user.role !== 'AGENT') {
      return sendError(res, 403, 'Forbidden');
    }

    const hasAccess = access === 'bgc' ? user.canAccessBgc : user.canAccessPaymentHistory;
    if (!hasAccess) {
      return sendError(res, 403, 'Forbidden');
    }

    return next();
  };
}
