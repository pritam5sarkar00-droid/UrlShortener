import { Router } from 'express';
import { redirectToLongUrl } from '../controllers/redirect.controller.js';
import { redirectLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

router.get('/:code', redirectLimiter, redirectToLongUrl);

export default router;
