import { createShortUrl } from '../services/url.service.js';

export async function shortenUrl(req, res, next) {
  try {
    const { longUrl, customAlias, expiresInDays } = req.body;

    if (customAlias && !req.user) {
      return res
        .status(403)
        .json({ error: 'Custom aliases require an account - sign up or log in first' });
    }

    const row = await createShortUrl({
      longUrl,
      customAlias,
      expiresInDays,
      userId: req.user?.id ?? null,
    });

    res.status(201).json({
      shortCode: row.short_code,
      shortUrl: `${process.env.BASE_URL}/${row.short_code}`,
      longUrl: row.long_url,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That custom alias is already taken' });
    }
    next(err);
  }
}
