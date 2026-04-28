import { Request, Response, NextFunction } from 'express';
import { validate, validateParams } from '../../middleware/validate';
import { sendError, sendSuccess } from '../../utils/response';
import {
  createAvailableTechnologySchema,
  technologyIdParamSchema,
  updateAvailableTechnologySchema,
} from './availableTechnologies.types';
import {
  createAvailableTechnology,
  deleteAvailableTechnology,
  listAvailableTechnologies,
  updateAvailableTechnology,
} from './availableTechnologies.service';

export async function handleListAvailableTechnologies(_req: Request, res: Response, next: NextFunction) {
  try {
    const technologies = await listAvailableTechnologies();
    sendSuccess(res, technologies);
  } catch (err) {
    next(err);
  }
}

export const handleCreateAvailableTechnology = [
  validate(createAvailableTechnologySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const technology = await createAvailableTechnology(req.body);
      sendSuccess(res, technology, 201);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

export const handleUpdateAvailableTechnology = [
  validateParams(technologyIdParamSchema),
  validate(updateAvailableTechnologySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const technology = await updateAvailableTechnology(req.params.technologyId, req.body);
      sendSuccess(res, technology);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

export const handleDeleteAvailableTechnology = [
  validateParams(technologyIdParamSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteAvailableTechnology(req.params.technologyId);
      sendSuccess(res, { id: req.params.technologyId });
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];