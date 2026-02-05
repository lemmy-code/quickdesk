import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as roomsController from '../controllers/rooms.controller';

const createRoomSchema = z.object({
  title: z.string().min(1).max(200),
});

const assignSchema = z.object({
  agentId: z.string().uuid(),
});

const router = Router();

router.use(authenticate);

router.post('/', validate(createRoomSchema), roomsController.create);
router.get('/', roomsController.list);
router.get('/:id', roomsController.getOne);
router.patch('/:id/assign', requireRole('agent', 'admin'), validate(assignSchema), roomsController.assign);
router.patch('/:id/close', requireRole('agent', 'admin'), roomsController.close);
router.get('/:id/messages', roomsController.getMessages);

export default router;
