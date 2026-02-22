import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate, validateParams } from '../middleware/validate';
import * as adminController from '../controllers/admin.controller';

const changeRoleSchema = z.object({
  role: z.enum(['guest', 'customer', 'agent', 'admin']),
});

const uuidParams = z.object({
  id: z.string().uuid(),
});

const router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.get('/users', adminController.listUsers);
router.patch('/users/:id/role', validateParams(uuidParams), validate(changeRoleSchema), adminController.changeRole);

export default router;
