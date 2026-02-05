import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as adminController from '../controllers/admin.controller';

const changeRoleSchema = z.object({
  role: z.enum(['guest', 'customer', 'agent', 'admin']),
});

const router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.get('/users', adminController.listUsers);
router.patch('/users/:id/role', validate(changeRoleSchema), adminController.changeRole);

export default router;
