import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendError } from '../../utils/response';
import { validate } from '../../middleware/validate';
import {
  updateProfileSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  createDepartmentSchema,
} from './settings.types';
import {
  getProfile,
  updateProfile,
  changePassword,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  listDepartments,
  createDepartment,
} from './settings.service';

// GET /api/settings/profile
export async function handleGetProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getProfile(req.user!.userId);
    sendSuccess(res, profile);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/settings/profile
export const handleUpdateProfile = [
  validate(updateProfileSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await updateProfile(req.user!.userId, req.body);
      sendSuccess(res, profile);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

// POST /api/settings/password
export const handleChangePassword = [
  validate(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await changePassword(req.user!.userId, req.body);
      sendSuccess(res, { message: 'Password changed successfully' });
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

// GET /api/settings/users
export async function handleListUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await listUsers();
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
}

// POST /api/settings/users
export const handleCreateUser = [
  validate(createUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await createUser(req.body);
      sendSuccess(res, user, 201);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

// GET /api/settings/departments
export async function handleListDepartments(req: Request, res: Response, next: NextFunction) {
  try {
    const departments = await listDepartments();
    sendSuccess(res, departments);
  } catch (err) {
    next(err);
  }
}

// POST /api/settings/departments
export const handleCreateDepartment = [
  validate(createDepartmentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const department = await createDepartment(req.body);
      sendSuccess(res, department, 201);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];

// DELETE /api/settings/users/:userId
export async function handleDeleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;
    await deleteUser(userId, req.user!.userId);
    sendSuccess(res, { message: 'User deleted successfully' });
  } catch (err: unknown) {
    const e = err as { message: string; statusCode?: number };
    if (e.statusCode) return sendError(res, e.statusCode, e.message);
    next(err);
  }
}

// PATCH /api/settings/users/:userId
export const handleUpdateUser = [
  validate(updateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      // Prevent self-deactivation
      if (userId === req.user!.userId && req.body.isActive === false) {
        return sendError(res, 400, 'You cannot deactivate your own account');
      }
      const user = await updateUser(userId, req.body);
      sendSuccess(res, user);
    } catch (err: unknown) {
      const e = err as { message: string; statusCode?: number };
      if (e.statusCode) return sendError(res, e.statusCode, e.message);
      next(err);
    }
  },
];
