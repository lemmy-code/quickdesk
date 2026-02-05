import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import * as authController from '../controllers/auth.controller';

const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/guest', authController.guest);
router.post('/refresh', validate(refreshSchema), authController.refresh);

export default router;
