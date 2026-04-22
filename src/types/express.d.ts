import { JwtPayload } from '../middleware/authenticate';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
