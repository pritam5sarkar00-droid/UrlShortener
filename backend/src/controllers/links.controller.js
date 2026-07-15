import { listLinksForUser, deactivateLink, permanentlyDeleteLink } from '../services/url.service.js';

export async function listLinks(req, res, next) {
  try {
    const rows = await listLinksForUser(req.user.id);
    res.json({
      links: rows.map((r) => ({
        shortCode: r.short_code,
        longUrl: r.long_url,
        clickCount: Number(r.click_count),
        isCustomAlias: r.is_custom_alias,
        isActive: r.is_active,
        isExpired: r.is_expired,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        title: r.title,
        // Falls back to 'Other' rather than null/blank. Two cases land here:
        // a link still mid-enrichment (gets corrected within a few seconds
        // via the live link:enriched push), and older rows saved before
        // category was guaranteed non-null, where a failed enrichment left
        // it permanently NULL in Postgres. Healing it here means those rows
        // display correctly immediately, with no DB backfill required.
        category: r.category || 'Other',
        summary: r.summary,
        keyTopics: r.key_topics,
        readingTimeMinutes: r.reading_time_minutes,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteLink(req, res, next) {
  try {
    const deleted = await deactivateLink(req.params.code, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Link not found' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function permanentDeleteLink(req, res, next) {
  try {
    const deleted = await permanentlyDeleteLink(req.params.code, req.user.id);
    if (!deleted) {
      return res.status(404).json({
        error: 'Link not found, not owned by you, or not yet deleted - delete it first before removing it permanently',
      });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
