import { Router } from 'express';
import { shortenUrl } from '../controllers/url.controller.js';
import { listLinks, deleteLink, permanentDeleteLink } from '../controllers/links.controller.js';
import { validateShortenRequest } from '../middlewares/validate.middleware.js';
import { checkUrlSafety } from '../middlewares/safeBrowsing.middleware.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { shortenLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = Router();

// optionalAuth runs first so shortenLimiter's per-request max() and the
// controller's custom-alias check both have req.user available.
router.post('/shorten', optionalAuth, shortenLimiter, validateShortenRequest, checkUrlSafety, shortenUrl);

router.get('/links', requireAuth, listLinks);
router.delete('/links/:code', requireAuth, deleteLink);
router.delete('/links/:code/permanent', requireAuth, permanentDeleteLink);

export default router;
