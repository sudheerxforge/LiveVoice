import { BACKEND_URL } from '../config';

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Asks our backend for a single-use Gemini Live token. The real API key stays
 * on the server; the token only works for one session with the given model.
 */
export async function fetchLiveToken(model: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: controller.signal,
    });
  } catch {
    throw new Error(
      `Can't reach the backend at ${BACKEND_URL}. Is the server running?`,
    );
  } finally {
    clearTimeout(timer);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.token) {
    throw new Error(body?.detail ?? `Backend error (HTTP ${res.status})`);
  }
  return body.token;
}

/** Live API WebSocket URL for a session authenticated with an ephemeral token. */
export function liveSocketUrl(token: string): string {
  return (
    'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.' +
    'v1alpha.GenerativeService.BidiGenerateContentConstrained' +
    `?access_token=${encodeURIComponent(token)}`
  );
}
