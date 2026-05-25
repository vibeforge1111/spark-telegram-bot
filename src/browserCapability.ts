export type BrowserCapabilityIntentKind = 'capability' | 'specific_open' | 'specific_screenshot' | 'task' | 'logged_in';

export type BrowserCapabilityIntent = {
  kind: BrowserCapabilityIntentKind;
  url?: string;
  goal?: string;
};

export function classifyBrowserCapabilityQuestion(text: string): BrowserCapabilityIntent | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const url = extractFirstUrl(text);
  const asksNow = /\b(?:can|could|are|is|do|does)\b/.test(normalized) || /\bright now\b|\bcurrently\b|\bdefinitely\b/.test(normalized);
  const loggedIn = /\b(?:logged[-\s]*in|cookies?|profile reuse|authenticated|account|dashboard)\b/.test(normalized)
    && /\b(?:can|could|open|browse|access|visit|use)\b/.test(normalized);
  if (loggedIn) {
    return browserIntent('logged_in', url);
  }

  const taskRequest = Boolean(url)
    && /\b(?:browser-use|browser\s+use|browser|browse)\b/.test(normalized)
    && /\b(?:review|qa|test|check|audit|evaluate|compare|gather feedback|walk through|improve)\b/.test(normalized);
  if (taskRequest) {
    return browserIntent('task', url, text.trim());
  }

  const screenshot = /\b(?:screenshot|screen shot|capture)\b/.test(normalized)
    && (asksNow || Boolean(url) || /\btelegram\b/.test(normalized));
  if (screenshot) {
    return browserIntent('specific_screenshot', url);
  }

  const specificOpen = Boolean(url)
    && /\b(?:open|visit|browse|inspect|read|look at|tell me what you see|see)\b/.test(normalized);
  if (specificOpen) {
    return browserIntent('specific_open', url);
  }

  const browserWords = /\b(?:browse|browser|browser-use|browser\s+use|web\s+page|webpages?|open\s+pages?|screenshots?)\b/.test(normalized);
  const capabilityWords = /\b(?:can|able|capability|available|working|ready|proven|definitely)\b/.test(normalized);
  if (asksNow && browserWords && capabilityWords) {
    return { kind: 'capability' };
  }

  return null;
}

export function shouldAnswerBrowserCapabilityQuestion(text: string): boolean {
  return classifyBrowserCapabilityQuestion(text) !== null;
}

export function renderBrowserCapabilityAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const status = String(payload.status || 'unknown').trim();
  const summary = String(payload.probe_summary || '').trim();
  const failure = String(payload.failure_reason || '').trim();
  const proofs = browserProofLabels(summary);
  const proofText = proofs.length ? proofs.join(', ') : 'the browser route probe';
  const bullet = '\u2022';

  if (status !== 'success') {
    return [
      'Browser-use is not proven from this runner right now.',
      '',
      'Why',
      `${bullet} ${failure || 'The latest browser route probe did not produce a passing receipt.'}`,
      '',
      'Run /probe browser when you want a fresh receipt.'
    ].join('\n');
  }

  if (intent.kind === 'logged_in') {
    return [
      'No. Logged-in browser use with cookies is still unproven right now.',
      '',
      'Fresh proof only covers',
      ...proofs.map((proof) => `${bullet} ${proof}`),
      '',
      'Needed next',
      `${bullet} a cookie-backed browser-use probe before claiming logged-in dashboard access`
    ].join('\n');
  }

  if (intent.kind === 'specific_screenshot') {
    return [
      'Screenshot capture is proven for the browser-use smoke probe, but Telegram does not yet expose a general screenshot command for arbitrary URLs.',
      '',
      'Fresh proof',
      ...proofs.map((proof) => `${bullet} ${proof}`),
      '',
      'Needed next',
      `${bullet} add /browser screenshot <url> so Spark can return a URL-specific screenshot receipt`
    ].join('\n');
  }

  if (intent.kind === 'specific_open') {
    const target = intent.url ? ` ${intent.url}` : ' that URL';
    return [
      `Not fully yet. A fresh browser-use probe proves public page open/state/screenshot works, but Telegram does not yet return page contents for${target}.`,
      '',
      'Fresh proof',
      `${bullet} ${proofText}`,
      '',
      'Honest boundary',
      `${bullet} I can prove the browser-use path is ready; I should not claim what that specific page says until a URL-specific open/read route exists.`
    ].join('\n');
  }

  return [
    'Yes, for the small browser checks covered by the fresh probe. Not for full browser automation.',
    '',
    'Proven',
    ...proofs.map((proof) => `${bullet} ${proof}`),
    '',
    'Still unproven',
    `${bullet} logged-in pages, cookies/profile reuse, arbitrary sites, sensitive click workflows, and Spawner browser automation`
  ].join('\n');
}

export function renderBrowserUseActionAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const action = String(payload.action || intent.kind.replace('specific_', '') || 'open').trim();
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const url = String(payload.final_url || payload.url || intent.url || '').trim();
  const title = String(payload.title || '').trim();
  const text = boundedTelegramText(String(payload.text_excerpt || '').trim(), 700);
  const failure = String(payload.last_failure_reason || '').trim();
  const bullet = '\u2022';

  if (!ok) {
    return [
      `Browser-use ${action} did not complete.`,
      '',
      'Why',
      `${bullet} ${failure || 'No passing browser-use receipt was returned.'}`
    ].join('\n');
  }

  const lines = [
    action === 'screenshot' ? 'Browser-use opened the page and captured a screenshot.' : 'Browser-use opened the page.',
    '',
    'Page',
  ];
  if (title) lines.push(`${bullet} ${title}`);
  if (url) lines.push(`${bullet} ${url}`);
  if (text) {
    lines.push('', 'Visible text', text);
  }
  if (action === 'screenshot') {
    lines.push('', 'Screenshot', `${bullet} captured from the live browser-use session`);
  }
  lines.push('', 'Boundary', `${bullet} public URL evidence only; cookies and logged-in sessions are still separate`);
  return lines.join('\n');
}

export function renderBrowserUseTaskAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const failure = String(payload.last_failure_reason || '').trim();
  const finalResult = boundedTelegramText(String(payload.final_result || '').trim(), 900);
  const urls = arrayOfStrings(payload.urls).slice(0, 4);
  const steps = Number(payload.number_of_steps || 0);
  const screenshots = arrayOfStrings(payload.screenshot_paths);
  const bullet = '\u2022';

  if (!ok) {
    return [
      'Browser-use task did not complete.',
      '',
      'Why',
      `${bullet} ${failure || 'No passing browser-use task receipt was returned.'}`
    ].join('\n');
  }

  const lines = [
    'Browser-use ran the task loop.',
    '',
    'Result',
    finalResult ? `${bullet} ${finalResult}` : `${bullet} Completed without a text result.`,
  ];
  if (steps > 0) {
    lines.push('', 'Run', `${bullet} ${steps} browser step${steps === 1 ? '' : 's'}`);
  }
  if (urls.length > 0) {
    lines.push('', 'Visited', ...urls.map((url) => `${bullet} ${url}`));
  } else if (intent.url) {
    lines.push('', 'Visited', `${bullet} ${intent.url}`);
  }
  if (screenshots.length > 0) {
    lines.push('', 'Evidence', `${bullet} ${screenshots.length} screenshot artifact${screenshots.length === 1 ? '' : 's'} saved`);
  }
  return lines.join('\n');
}

function browserProofLabels(summary: string): string[] {
  const match = summary.match(/(?:^|\s)proofs=([a-z0-9_,.-]+)/i);
  if (!match) return [];
  const labels: Record<string, string> = {
    doctor: 'doctor check',
    public_page_open: 'public page open',
    screenshot_capture: 'screenshot capture',
    state_read: 'page state read',
  };
  return match[1]
    .split(',')
    .map((item) => labels[item.trim()] || '')
    .filter(Boolean);
}

function extractFirstUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s)>\]]+/i);
  return match?.[0]?.replace(/[.,;!?]+$/, '');
}

function browserIntent(kind: BrowserCapabilityIntentKind, url?: string, goal?: string): BrowserCapabilityIntent {
  return {
    kind,
    ...(url ? { url } : {}),
    ...(goal ? { goal } : {}),
  };
}

function boundedTelegramText(value: string, limit: number): string {
  const compact = value.replace(/\n{3,}/g, '\n\n').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 14)).trimEnd()}\n[truncated]`;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}
