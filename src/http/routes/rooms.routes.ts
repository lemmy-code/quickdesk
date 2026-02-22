import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate, validateParams } from '../middleware/validate';
import * as roomsController from '../controllers/rooms.controller';

const createRoomSchema = z.object({
  title: z.string().min(1).max(200),
});

const assignSchema = z.object({
  agentId: z.string().uuid(),
});

const uuidParams = z.object({
  id: z.string().uuid(),
});

const router = Router();

router.use(authenticate);

router.post('/', validate(createRoomSchema), roomsController.create);
router.get('/', roomsController.list);
router.get('/:id', validateParams(uuidParams), roomsController.getOne);
router.patch('/:id/assign', validateParams(uuidParams), requireRole('agent', 'admin'), validate(assignSchema), roomsController.assign);
router.patch('/:id/close', validateParams(uuidParams), requireRole('agent', 'admin'), roomsController.close);
router.get('/:id/messages', validateParams(uuidParams), roomsController.getMessages);

export default router;
