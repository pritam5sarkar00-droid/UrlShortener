import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

// NOTE: URL-creation validation deliberately isn't a zod schema here - see
// validateShortenRequest in validate.middleware.js. zod's .url() doesn't
// restrict to http(s) (it would accept "javascript:..."), and there's no
// built-in way to express the reserved-alias check declaratively.
