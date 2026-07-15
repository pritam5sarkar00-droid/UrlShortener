import { Router } from 'express';
import authRoutes from './auth.routes.js';
import urlRoutes from './url.routes.js';
import redirectRoutes from './redirect.routes.js';

const router = Router();

// More specific routes first - /api/... must be matched before the generic
// /:code catch-all redirect route below.
router.use('/api/auth', authRoutes);
router.use('/api', urlRoutes);
router.use('/', redirectRoutes);

export default router;
