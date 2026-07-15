const SAFE_BROWSING_URL = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const TIMEOUT_MS = 5000;

const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];

/**
 * Checks a URL against Google's real-time threat lists.
 * Returns { checked, flagged, threatTypes }:
 *   - checked: false means no API key is configured - this is a config gap,
 *     not a threat verdict, and callers should treat it as "skip the check".
 *   - flagged: true means the URL genuinely matched one of Google's lists.
 * Throws on network/API failures (timeout, non-2xx, etc) - the caller (the
 * middleware) decides whether to fail open or closed, this function's job is
 * only to report what actually happened.
 */
export async function checkUrlAgainstSafeBrowsing(longUrl) {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    return { checked: false, flagged: false, threatTypes: [] };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${SAFE_BROWSING_URL}?key=${apiKey}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'url-shortener-project', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: longUrl }],
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Safe Browsing API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const matches = data.matches || [];
    return {
      checked: true,
      flagged: matches.length > 0,
      threatTypes: [...new Set(matches.map((m) => m.threatType))],
    };
  } finally {
    clearTimeout(timeout);
  }
}
