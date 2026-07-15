const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 8000;

function buildPrompt(title, textSample) {
  return `You are summarizing a webpage for a URL shortener's link preview feature.

Title: ${title || '(unknown)'}
Content excerpt: ${textSample}

Respond with ONLY a JSON object, no markdown code fences, no explanation, in exactly this shape:
{"summary": "<exactly 2 sentences summarizing the page>", "keyTopics": ["<topic 1>", "<topic 2>", "<topic 3>"]}

keyTopics must be 3-5 short phrases (1-3 words each).`;
}

// Models occasionally wrap JSON in ```json fences despite instructions not
// to - strip those, then fall back to grabbing the first {...} block if the
// response still isn't directly parseable.
function parseModelJson(text) {
  const stripped = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Returns { summary, keyTopics } or { summary: null, keyTopics: null } on
 * any failure: no API key configured, network error, non-2xx response, or a
 * response that couldn't be parsed as the expected JSON shape. Never throws.
 */
export async function summarizeWithGemini({ title, textSample }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const empty = { summary: null, keyTopics: null };

  if (!apiKey || !textSample) return empty;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(title, textSample) }] }],
      }),
    });

    if (!res.ok) {
      // The status code alone ("HTTP 400") isn't enough to debug a bad-key
      // vs. quota vs. disabled-API failure - Google's response body names
      // the actual reason. Guarded for environments/mocks without .text().
      const errorBody = typeof res.text === 'function' ? await res.text().catch(() => '') : '';
      console.error(`[gemini] API returned HTTP ${res.status}${errorBody ? `: ${errorBody.slice(0, 300)}` : ''}`);
      return empty;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return empty;

    const parsed = parseModelJson(text);
    if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.keyTopics)) {
      console.error('[gemini] response did not match the expected JSON shape');
      return empty;
    }

    return {
      summary: parsed.summary.slice(0, 1000),
      keyTopics: parsed.keyTopics.slice(0, 5).map((t) => String(t).slice(0, 50)),
    };
  } catch (err) {
    console.error('[gemini] summarization failed (non-fatal):', err.message);
    return empty;
  } finally {
    clearTimeout(timeout);
  }
}
