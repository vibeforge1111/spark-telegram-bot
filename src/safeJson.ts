/** Safe JSON.parse for persisted Telegram bot payloads. */
export function safeJsonParse<T>(raw: string, fallback: T, label = 'payload'): T {
  if (!raw || !String(raw).trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[safe-json] Invalid JSON (${label}):`, err);
    return fallback;
  }
}
