import express from 'express';
import { registerHandler, loginHandler, googleLoginHandler } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { registerSchema, loginSchema } from '../utils/validators.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), registerHandler);
router.post('/login', authLimiter, validate(loginSchema), loginHandler);
router.post('/google', authLimiter, googleLoginHandler);

export default router;
