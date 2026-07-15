import { assertPublicHostname } from '../utils/ssrfGuard.js';
import { pageEnrichmentTotal } from '../config/metrics.js';

const FETCH_TIMEOUT_MS = 8000; // bumped from 5000 - some sites are slow, especially through a redirect/challenge chain
const MAX_BYTES = 200_000; // enough for <head>, no need to download whole pages
const RETRY_DELAY_MS = 1000;

// Domain -> category. Checked against the hostname before falling back to
// keyword matching on the page title.
const DOMAIN_CATEGORIES = [
  [/(^|\.)wikipedia\.org$/, 'Education'],
  [/(^|\.)(coursera|udemy|khanacademy|edx)\.org$|\.edu$/, 'Education'],
  [/(^|\.)(amazon|ebay|flipkart|myntra|etsy)\./, 'Shopping'],
  [/(^|\.)(facebook|instagram|twitter|x|linkedin|reddit|tiktok)\.com$/, 'Social Media'],
  [/(^|\.)(cnn|bbc|nytimes|reuters|theguardian|timesofindia)\./, 'News'],
  [/\.gov$|\.gov\.\w+$/, 'Government'],
  [/(^|\.)(netflix|youtube|spotify|hulu|primevideo)\./, 'Entertainment'],
  [/(^|\.)(paypal|stripe|chase|bankofamerica|hdfcbank|icicibank)\./, 'Finance'],
  [/(^|\.)github\.com$|stackoverflow\.com$/, 'Education'],
];

// Fallback if the domain isn't recognized: keyword-score the page title.
const KEYWORD_CATEGORIES = {
  Education: ['course', 'tutorial', 'learn', 'university', 'lecture'],
  Shopping: ['buy', 'price', 'shop', 'store', 'cart', 'deal'],
  News: ['news', 'breaking', 'report'],
  Entertainment: ['watch', 'movie', 'episode', 'stream', 'game'],
  Finance: ['bank', 'invest', 'loan', 'finance', 'payment'],
  'Social Media': ['profile', 'post', 'follow'],
};

const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

function decodeEntities(str) {
  return str.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

export function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(match[1]).trim().replace(/\s+/g, ' ');
  return title.length > 0 ? title.slice(0, 500) : null;
}

const SUMMARY_EXCERPT_MAX_CHARS = 4000; // enough context for Gemini, keeps token usage small

/**
 * Strips <script>/<style> blocks and all remaining tags to get rough plain
 * text, for word-count-based reading time and as an excerpt to summarize.
 * Not a real HTML parser - good enough for these two purposes, consistent
 * with the lightweight regex approach already used for title extraction.
 */
export function extractTextSample(html) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const plainText = decodeEntities(withoutScripts.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  const wordCount = plainText.length > 0 ? plainText.split(' ').length : 0;
  return { text: plainText.slice(0, SUMMARY_EXCERPT_MAX_CHARS), wordCount };
}

export function categorize(hostname, title) {
  for (const [pattern, category] of DOMAIN_CATEGORIES) {
    if (pattern.test(hostname)) return category;
  }
  if (title) {
    const lower = title.toLowerCase();
    for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
      if (keywords.some((kw) => lower.includes(kw))) return category;
    }
  }
  return 'Other';
}

async function attemptFetch(longUrl) {
  try {
    await assertPublicHostname(longUrl);
  } catch (err) {
    return { ok: false, reason: 'ssrf_blocked', detail: err.message };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(longUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; URLShortenerBot/1.0)' },
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      return { ok: false, reason: 'blocked_status', detail: `HTTP ${res.status}` };
    }
    if (!contentType.includes('text/html')) {
      return { ok: false, reason: 'non_html', detail: contentType || '(no content-type)' };
    }

    // Read only up to MAX_BYTES - no need for the whole page just for <title>.
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, reason: 'non_html', detail: 'no readable body' };

    let received = 0;
    const chunks = [];
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    await reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).toString('utf-8');

    const title = extractTitle(html);
    const hostname = new URL(longUrl).hostname;
    const category = categorize(hostname, title);
    const { text: textSample, wordCount } = extractTextSample(html);

    return { ok: true, title, category, textSample: textSample || null, wordCount };
  } catch (err) {
    const reason = err.name === 'AbortError' ? 'timeout' : 'network_error';
    return { ok: false, reason, detail: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Best-effort page metadata fetch, with one retry on failure - a lot of
 * "sometimes it doesn't work" cases are transient (a slow response, a
 * momentary network blip), and a single retry catches most of those cheaply
 * since this runs fire-and-forget in the background anyway. Never throws -
 * returns nulls for title/summary/reading-time on any failure, since this
 * must never affect whether the link itself gets created. Every outcome
 * (success or the specific failure reason) is logged and recorded in
 * page_enrichment_total, so failures are debuggable instead of a silent
 * black box.
 *
 * category is the one exception to "nulls on failure": categorizing by
 * hostname alone (categorize() with a null title) needs no network call -
 * it's just reading the domain out of the URL string - so it's always
 * available, worst case 'Other', even when the fetch itself is blocked,
 * times out, or 404s. A link should never show a blank category just
 * because the target site happened to block the fetch.
 *
 * Honest limitation: this does a plain HTTP fetch, not a real browser - it
 * can't execute JavaScript, so sites that render their title/content
 * client-side (many modern single-page apps) may come back with an empty or
 * generic title even on a technical "success". Sites with bot detection
 * (Cloudflare challenges, WAFs blocking non-browser User-Agents) will also
 * legitimately fail every time - a retry helps transient issues, not a
 * deterministic block, and there's no way to fix that without running a
 * full headless browser, which is out of scope for this feature.
 */
export async function fetchPageMetadata(longUrl) {
  let hostname = '';
  try {
    hostname = new URL(longUrl).hostname;
  } catch {
    // Shouldn't happen in practice - longUrl is validated as a real URL
    // before a link can even be created - but categorize('', null) still
    // resolves to a safe 'Other' rather than throwing, so this is just
    // defensive rather than load-bearing.
  }

  let result = await attemptFetch(longUrl);

  // Only retry genuinely transient categories - a deterministic block (SSRF
  // guard, a 403, the wrong content-type) will fail exactly the same way a
  // second later, so retrying it would just waste the delay for nothing.
  const isTransient = !result.ok && (result.reason === 'timeout' || result.reason === 'network_error');
  if (isTransient) {
    console.warn(
      `[enrichment] attempt 1 failed for ${longUrl}: ${result.reason} (${result.detail}) - retrying once`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    result = await attemptFetch(longUrl);
  }

  if (result.ok) {
    pageEnrichmentTotal.inc({ result: 'success' });
    return {
      title: result.title,
      category: result.category,
      textSample: result.textSample,
      wordCount: result.wordCount,
    };
  }

  console.warn(
    `[enrichment] failed for ${longUrl}${isTransient ? ' after retry' : ' (not retried - deterministic failure)'}: ${result.reason} (${result.detail})`
  );
  pageEnrichmentTotal.inc({ result: result.reason });
  return { title: null, category: categorize(hostname, null), textSample: null, wordCount: 0 };
}
