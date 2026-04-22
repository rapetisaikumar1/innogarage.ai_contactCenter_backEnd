import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'Authentication required');
      return;
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 403, 'You do not have permission to perform this action');
      return;
    }

    next();
  };
}
