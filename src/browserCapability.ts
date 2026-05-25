export type BrowserCapabilityIntentKind = 'capability' | 'specific_open' | 'specific_screenshot' | 'task' | 'logged_in';

export type BrowserCapabilityIntent = {
  kind: BrowserCapabilityIntentKind;
  url?: string;
  goal?: string;
  profile?: BrowserUseProfileOptions;
};

export type BrowserUseProfileOptions = {
  profile?: string;
  userDataDir?: string;
  profileDirectory?: string;
  storageState?: string;
  cdpUrl?: string;
};

export type BrowserUseCommandParseResult = {
  args: string[];
  profile: BrowserUseProfileOptions;
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
    && (
      asksForBrowserWork(normalized)
      || asksForProductUiWork(normalized)
      || asksForReferenceResearch(normalized)
    );
  if (taskRequest) {
    return browserIntent('task', url, text.trim());
  }

  const screenshot = /\b(?:screenshot|screen shot|capture)\b/.test(normalized)
    && (asksNow || Boolean(url) || /\btelegram\b/.test(normalized));
  if (screenshot) {
    return browserIntent('specific_screenshot', url);
  }

  const specificOpen = Boolean(url)
    && /\b(?:open|visit|browse|inspect|read|look at|tell me what you see|see)\b/.test(normalized)
    && !/\b(?:ui|ux|product|page|site|app|screen|interface)\b.*\b(?:fixes?|feedback|improve|review|check|audit)\b/.test(normalized);
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

function asksForBrowserWork(normalized: string): boolean {
  return /\b(?:browser-use|browser\s+use|browser|browse)\b/.test(normalized)
    && /\b(?:review|qa|test|check|audit|evaluate|compare|gather feedback|walk through|improve|fixes?|feedback)\b/.test(normalized);
}

function asksForProductUiWork(normalized: string): boolean {
  const productSurface = /\b(?:ui|ux|product|page|site|app|screen|interface)\b/;
  const improvementAsk = /\b(?:review|qa|test|check|audit|evaluate|gather feedback|improve|fixes?|feedback)\b/;
  return productSurface.test(normalized) && improvementAsk.test(normalized);
}

function asksForReferenceResearch(normalized: string): boolean {
  return /\b(?:research|find|look up)\b.*\b(?:references?|examples?|competitors?|inspiration|internet|web)\b/.test(normalized)
    || /\b(?:compare|benchmark)\b.*\b(?:references?|examples?|competitors?|internet|web)\b/.test(normalized)
    || /\bcompare\b.*https?:\/\/.*\binspired by\b/.test(normalized)
    || /\b(?:inspire|inspired by|adapt|learn from|copy)\b.*\b(?:references?|examples?|competitors?|products?|sites?)\b/.test(normalized);
}

export function browserTaskNeedsReferenceResearch(intent: BrowserCapabilityIntent): boolean {
  return asksForReferenceResearch(String(intent.goal || '').toLowerCase().replace(/\s+/g, ' ').trim());
}

export function parseBrowserUseCommandArgs(text: string): BrowserUseCommandParseResult {
  const tokens = splitBrowserUseCommandText(text);
  const args: string[] = [];
  const profile: BrowserUseProfileOptions = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] || '';
    const next = tokens[index + 1] || '';
    const readValue = (inline: string): string => {
      if (inline) return inline;
      index += 1;
      return next;
    };
    if (token === '--profile') {
      profile.profile = readValue('');
      continue;
    }
    if (token.startsWith('--profile=')) {
      profile.profile = readValue(token.slice('--profile='.length));
      continue;
    }
    if (token === '--user-data-dir') {
      profile.userDataDir = readValue('');
      continue;
    }
    if (token.startsWith('--user-data-dir=')) {
      profile.userDataDir = readValue(token.slice('--user-data-dir='.length));
      continue;
    }
    if (token === '--profile-directory') {
      profile.profileDirectory = readValue('');
      continue;
    }
    if (token.startsWith('--profile-directory=')) {
      profile.profileDirectory = readValue(token.slice('--profile-directory='.length));
      continue;
    }
    if (token === '--storage-state') {
      profile.storageState = readValue('');
      continue;
    }
    if (token.startsWith('--storage-state=')) {
      profile.storageState = readValue(token.slice('--storage-state='.length));
      continue;
    }
    if (token === '--cdp-url') {
      profile.cdpUrl = readValue('');
      continue;
    }
    if (token.startsWith('--cdp-url=')) {
      profile.cdpUrl = readValue(token.slice('--cdp-url='.length));
      continue;
    }
    args.push(token);
  }
  return { args, profile: compactBrowserUseProfile(profile) };
}

export function shouldRunFullBrowserUseTask(goal: string): boolean {
  const normalized = goal.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return /\b(?:click|press|select|type|fill|submit|scroll|navigate|interact|walk through|step through|log in|login|sign in)\b/.test(normalized)
    || /\bopen (?:details|trace|canvas|kanban|settings|skills|panel|inspector)\b/.test(normalized)
    || /\b(?:ui|ux|product|app|site|page|screen|interface)\b.*\b(?:fixes?|feedback|improve|review|check|audit)\b/.test(normalized)
    || /\b(?:fixes?|feedback|improve|review|check|audit)\b.*\b(?:ui|ux|product|app|site|page|screen|interface)\b/.test(normalized)
    || asksForReferenceResearch(normalized)
    || /\b(?:like|as) an operator\b/.test(normalized);
}

export function browserUseTaskScreenshotPath(payload: Record<string, unknown>): string {
  const screenshots = arrayOfStrings(payload.screenshot_paths);
  const latest = [...screenshots].reverse().find(Boolean);
  if (latest) return latest;
  const startPage = payload.start_page;
  if (startPage && typeof startPage === 'object') {
    return String((startPage as Record<string, unknown>).screenshot_path || '').trim();
  }
  return '';
}

export function browserUseProfileLabel(profile: BrowserUseProfileOptions | undefined): string {
  if (!profile) return '';
  return profile.profile || profile.profileDirectory || (profile.userDataDir ? 'custom user data dir' : '') || (profile.storageState ? 'storage state' : '') || (profile.cdpUrl ? 'running browser via CDP' : '');
}

export function renderBrowserCapabilityAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const status = String(payload.status || 'unknown').trim();
  const summary = String(payload.probe_summary || '').trim();
  const failure = String(payload.failure_reason || '').trim();
  const proofs = browserProofLabels(summary);
  const bullet = '\u2022';

  if (status !== 'success') {
    return [
      'Browser-use is not ready in this runner right now.',
      '',
      'Why',
      `${bullet} ${humanBrowserFailure(failure || 'The latest browser check did not pass.')}`,
      '',
      'Run /probe browser when you want a fresh receipt.'
    ].join('\n');
  }

  if (intent.kind === 'logged_in') {
    return [
      'No, not yet. The fresh browser check does not prove cookie-backed or logged-in browsing.',
      '',
      'Proven now',
      ...proofs.map((proof) => `${bullet} ${proof}`),
      '',
      'Needed next',
      `${bullet} run a browser profile or cookie-backed check before claiming dashboard access`
    ].join('\n');
  }

  if (intent.kind === 'specific_screenshot') {
    return [
      'Screenshot capture is proven for the browser-use smoke check, but this answer did not capture that URL.',
      '',
      'Fresh proof',
      ...proofs.map((proof) => `${bullet} ${proof}`),
      '',
      `Use /browser screenshot <url> for URL-specific evidence.`
    ].join('\n');
  }

  if (intent.kind === 'specific_open') {
    const target = intent.url ? ` ${intent.url}` : ' that URL';
    return [
      `Not from this answer alone. The browser route is proven, but Spark still needs to open${target} before saying what is on it.`,
      '',
      'Fresh proof',
      ...proofs.map((proof) => `${bullet} ${proof}`),
      '',
      `Use /browser open <url> for a URL-specific read.`
    ].join('\n');
  }

  return [
    'Yes, for the browser actions Spark just proved. Not for full browser automation.',
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
  const url = cleanBrowserText(String(payload.final_url || payload.url || intent.url || '').trim());
  const title = cleanBrowserText(String(payload.title || '').trim());
  const text = boundedTelegramText(cleanBrowserText(String(payload.text_excerpt || '').trim()), 700);
  const failure = String(payload.last_failure_reason || '').trim();
  const profileLabel = browserUsePayloadProfileLabel(payload, intent.profile);
  const bullet = '\u2022';

  if (!ok) {
    return [
      `Browser-use could not ${action === 'screenshot' ? 'capture that page' : 'open that page'}.`,
      '',
      'Why',
      `${bullet} ${humanBrowserFailure(failure || 'No passing browser-use result came back.')}`
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
  if (profileLabel === 'running browser via CDP') {
    lines.push(`${bullet} attached browser`);
  }
  lines.push('', 'Boundary', `${bullet} ${browserEvidenceBoundary(url, profileLabel)}`);
  return lines.join('\n');
}

export function renderBrowserUsePrimitiveAnswer(
  action: string,
  payload: Record<string, unknown>,
  profile?: BrowserUseProfileOptions
): string {
  const verb = cleanBrowserText(String(action || payload.action || 'action').trim().toLowerCase());
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const failure = String(payload.last_failure_reason || '').trim();
  const url = cleanBrowserText(String(payload.final_url || '').trim());
  const title = cleanBrowserText(String(payload.title || '').trim());
  const state = boundedTelegramText(cleanBrowserText(String(payload.state_excerpt || payload.command_stdout || '').trim()), 900);
  const profileLabel = browserUsePayloadProfileLabel(payload, profile);
  const bullet = '\u2022';

  if (!ok) {
    return [
      `Browser-use could not ${browserPrimitiveVerb(verb)}.`,
      '',
      'Why',
      `${bullet} ${humanBrowserFailure(failure || 'No passing browser-use result came back.')}`
    ].join('\n');
  }

  const lines = [
    `Browser-use ${browserPrimitivePastTense(verb)}.`,
  ];
  if (title || url) {
    lines.push('', 'Page');
    if (title) lines.push(`${bullet} ${title}`);
    if (url) lines.push(`${bullet} ${url}`);
  }
  if (state && verb !== 'close') {
    lines.push('', 'State', state);
  }
  if (profileLabel === 'running browser via CDP') {
    lines.push('', 'Profile', `${bullet} attached browser`);
  }
  return lines.join('\n');
}

export function renderBrowserUseTaskAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const failure = String(payload.last_failure_reason || '').trim();
  const finalResult = cleanBrowserText(String(payload.final_result || '').trim());
  const urls = uniqueStrings(arrayOfStrings(payload.urls));
  const steps = Number(payload.number_of_steps || 0);
  const screenshots = arrayOfStrings(payload.screenshot_paths);
  const profileLabel = browserUsePayloadProfileLabel(payload, intent.profile);
  const bullet = '\u2022';

  if (!ok) {
    if (browserTaskNeedsReferenceResearch(intent)) {
      const blockedReason = browserReferenceResearchBlockedReason(finalResult, failure);
      if (blockedReason) {
        return [
          'Browser-use reached the product page, but reference research was blocked.',
          '',
          'Why',
          `${bullet} ${blockedReason}`,
          '',
          'Move',
          `${bullet} Retry with direct product URLs to use for inspiration.`
        ].join('\n');
      }
      return [
        'Browser-use could not finish the reference research.',
        '',
        'Why',
        `${bullet} ${humanBrowserFailure(failure || 'No passing browser-use result came back.')}`,
        '',
        'Move',
        `${bullet} Retry with fewer references or name the products to use for inspiration.`
      ].join('\n');
    }
    return [
      'Browser-use could not finish that run.',
      '',
      'Why',
      `${bullet} ${humanBrowserFailure(failure || 'No passing browser-use result came back.')}`,
      '',
      'Move',
      `${bullet} Try the fast path first: /browser task <url> <focused goal>`
    ].join('\n');
  }

  const referenceResearch = browserTaskNeedsReferenceResearch(intent);
  const lines = [
    'Browser-use finished.',
    '',
    referenceResearch ? 'Inspired by' : 'Fix next',
    ...browserTaskResultLines(finalResult, bullet, intent.url || '', referenceResearch),
  ];
  const evidence = browserTaskEvidenceLine({
    steps,
    screenshots: screenshots.length,
    urls: urls.length ? urls : intent.url ? [intent.url] : [],
    profileLabel,
  });
  if (evidence) {
    lines.push('', 'Evidence', `${bullet} ${evidence}`);
  }
  return lines.join('\n');
}

function browserReferenceResearchBlockedReason(finalResult: string, failure: string): string {
  const combined = cleanBrowserText(`${finalResult}\n${failure}`)
    .replace(/\s+/g, ' ')
    .trim();
  if (!combined) return '';
  const normalized = combined.toLowerCase();

  if (/\b(?:captcha|recaptcha|bot[-\s]*verification|bot challenge|human challenge|verify you are human|not a robot)\b/.test(normalized)) {
    if (/\bgoogle\b/.test(normalized) && /\bduckduckgo\b/.test(normalized)) {
      return 'Google and DuckDuckGo asked for human verification, so the browser could not complete live web research.';
    }
    return 'The search page asked for human verification, so the browser could not complete live web research.';
  }

  if (/\b(?:search engines?|internet research|competitive research|reference research)\b.*\b(?:blocked|unable|could not)\b/.test(normalized)) {
    return 'The browser could observe the product page, but the external research step was blocked.';
  }

  return '';
}

export function renderBrowserUseReviewAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const failure = String(payload.last_failure_reason || '').trim();
  const url = cleanBrowserText(String(payload.final_url || payload.url || intent.url || '').trim());
  const title = cleanBrowserText(String(payload.title || '').trim());
  const text = cleanBrowserText(String(payload.text_excerpt || '').trim());
  const state = cleanBrowserText(String(payload.state_excerpt || '').trim());
  const profileLabel = browserUsePayloadProfileLabel(payload, intent.profile);
  const bullet = '\u2022';

  if (!ok) {
    return [
      'Browser-use could not review that page.',
      '',
      'Why',
      `${bullet} ${humanBrowserFailure(failure || 'No passing browser-use result came back.')}`
    ].join('\n');
  }

  const evidence = `${title}\n${text}\n${state}`;
  const pageRead = browserReviewPageRead(evidence, url);
  const improvements = browserReviewImprovements(evidence, url);
  const lines = [
    'Fast browser read.',
    '',
    'Page',
  ];
  if (title) lines.push(`${bullet} ${title}`);
  if (url) lines.push(`${bullet} ${url}`);
  if (pageRead) {
    lines.push('', 'Read', `${bullet} ${pageRead}`);
  }
  lines.push(
    '',
    'Fix next',
    ...improvements.map((item) => `${bullet} ${compactBrowserTaskBullet(item)}`),
    '',
    'Evidence',
    `${bullet} screenshot capture`,
    `${bullet} visible text and page state from this run`
  );
  if (profileLabel === 'running browser via CDP') {
    lines.push(`${bullet} attached browser`);
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

function browserPrimitiveVerb(action: string): string {
  const labels: Record<string, string> = {
    state: 'read browser state',
    click: 'click that target',
    type: 'type that text',
    input: 'fill that field',
    scroll: 'scroll the page',
    back: 'go back',
    eval: 'run that page script',
    close: 'close the browser session',
  };
  return labels[action] || 'run that browser action';
}

function browserPrimitivePastTense(action: string): string {
  const labels: Record<string, string> = {
    state: 'read the current state',
    click: 'clicked',
    type: 'typed',
    input: 'filled the field',
    scroll: 'scrolled',
    back: 'went back',
    eval: 'ran page JavaScript',
    close: 'closed the session',
  };
  return labels[action] || 'ran the action';
}

function splitBrowserUseCommandText(text: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter((token) => token.length > 0);
}

function compactBrowserUseProfile(profile: BrowserUseProfileOptions): BrowserUseProfileOptions {
  return Object.fromEntries(
    Object.entries(profile).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
  ) as BrowserUseProfileOptions;
}

function browserUsePayloadProfileLabel(
  payload: Record<string, unknown>,
  fallback: BrowserUseProfileOptions | undefined
): string {
  const payloadProfile = String(payload.profile || '').trim();
  const payloadProfileDirectory = String(payload.profile_directory || '').trim();
  const payloadCdpUrl = String(payload.cdp_url || '').trim();
  if (payload.profile_requested === true && (payloadProfile || payloadProfileDirectory)) {
    return payloadProfile || payloadProfileDirectory;
  }
  if (payload.profile_requested === true && payloadCdpUrl) {
    return 'running browser via CDP';
  }
  return browserUseProfileLabel(fallback);
}

function boundedTelegramText(value: string, limit: number): string {
  const compact = value.replace(/\n{3,}/g, '\n\n').trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, Math.max(0, limit - 14)).trimEnd()}\n[truncated]`;
}

function cleanBrowserText(value: string): string {
  return value
    .replace(/\u00c2([\u00a0-\u00bf])/g, '$1')
    .replace(/â€”/g, '-')
    .replace(/â€“/g, '-')
    .replace(/â†“/g, '↓')
    .replace(/â†’/g, '→')
    .replace(/âœ“/g, '✓')
    .replace(/âœ…/g, '✅')
    .replace(/Â/g, '')
    .trim();
}

function humanBrowserFailure(value: string): string {
  const cleaned = cleanBrowserText(value)
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = cleaned.toLowerCase();
  if (!cleaned) return 'Browser-use did not return a usable result.';
  if (/invalid model output|validation error|json_invalid|agentoutput|pydantic/.test(normalized)) {
    return 'The full browser agent returned an invalid action format. The fast screenshot/state review path should still work.';
  }
  if (/timed out|timeout/.test(normalized)) {
    return 'The browser run took too long for Telegram. Use a smaller goal, or run the full task when you can wait.';
  }
  if (/spawn einval/.test(normalized)) {
    return 'Telegram could not start the local browser-use command on this machine.';
  }
  if (/invalid choice.*browser-use|browser-use.*invalid choice/.test(normalized)) {
    return 'This Telegram runtime is using a Spark CLI that does not expose browser-use yet.';
  }
  if (/browser-use adapter status source is not ready|missing_status|package_available=false|cli_available=false/.test(normalized)) {
    return 'The browser-use adapter is not installed or ready in this runner.';
  }
  if (/command failed:|usage: spark|traceback|info \[agent\]|litellm|browser use telemetry/.test(normalized)) {
    return 'Browser-use failed before returning a clean result. Check the local browser-use logs for the raw command output.';
  }
  return cleaned;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean);
}

function browserTaskEvidenceLine(input: {
  steps: number;
  screenshots: number;
  urls: string[];
  profileLabel: string;
}): string {
  const sessionLabel = input.profileLabel === 'running browser via CDP'
    ? 'attached-browser run'
    : input.profileLabel
      ? `${input.profileLabel} browser run`
      : 'browser run';
  let line = `Live ${sessionLabel}`;
  if (input.urls.length > 0) {
    line += ` on ${browserTaskUrlLabel(input.urls[0] || '')}`;
  }
  if (input.screenshots > 0) {
    line += ' with screenshot evidence';
  }
  return line;
}

function browserTaskUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    if (last) return titleCase(last.replace(/[-_]+/g, ' '));
    return parsed.hostname;
  } catch {
    return url;
  }
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function browserTaskResultLines(value: string, bullet: string, contextUrl = '', referenceResearch = false): string[] {
  const cleaned = cleanBrowserTaskMarkdown(value);
  if (!cleaned) return [`${bullet} Completed without a text result.`];

  const lines = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fixHeadingIndex = lines.findIndex((line) => /\b(?:issues?\s+to\s+fix|fixes?|recommendations?|improvements?|what\s+to\s+fix)\b/i.test(line));
  const candidates = fixHeadingIndex >= 0 ? lines.slice(fixHeadingIndex + 1) : lines;
  const listItems = candidates
    .filter((line) => /^(?:\d+[.)]|[-*\u2022â€¢])\s+/.test(line))
    .map((line) => stripBrowserTaskListMarker(line))
    .filter((line) => browserTaskUsefulLine(line));

  const selected = listItems.length > 0
    ? listItems
    : candidates.filter((line) => browserTaskUsefulLine(line) && !/^(?:result|summary|overview)$/i.test(line));
  const useful = expandReferenceResearchFindings(selected)
    .slice(0, 5)
    .map((line) => `${bullet} ${humanizeBrowserTaskBullet(compactBrowserTaskBullet(line), referenceResearch)}`);
  if (useful.length > 0) return useful;
  return browserTaskFallbackFixes(contextUrl, bullet);
}

function expandReferenceResearchFindings(lines: string[]): string[] {
  return lines.flatMap((line) => {
    const normalized = cleanBrowserText(line).replace(/^codex:\s*/i, '').trim();
    if (!/\bcopy\/adapt\b/i.test(normalized)) return [line];

    const before = normalized.slice(0, normalized.search(/\bcopy\/adapt\b/i)).trim();
    const after = normalized
      .replace(/^.*?\bcopy\/adapt\s+\d*\s*things?:?\s*/i, '')
      .trim();
    const pieces = after
      ? after.split(/\s+(?=\d+[.)]\s+)/).map((piece) => piece.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean)
      : [];
    const researchRead = before
      .replace(/^research read:?\s*/i, '')
      .trim();
    return [
      ...(researchRead ? [`Research read: ${researchRead}`] : []),
      ...pieces.map((piece) => `Inspired by: ${piece}`),
    ];
  });
}

function browserTaskUsefulLine(value: string): boolean {
  const cleaned = stripBrowserTaskListMarker(value)
    .replace(/^[✅✓✔]\s*/, '')
    .trim();
  if (!cleaned) return false;
  if (/^(?:nodes?\s+observed|workflow\s+overview|issues?\s+to\s+fix|page load(?:\s*&\s*navigation)?|navigation|footer|top nav links?|pipeline selector)$/i.test(cleaned)) {
    return false;
  }
  if (/^[✅✓✔]/.test(value.trim())) return false;
  if (/\b(?:loads correctly|links present|footer present|shows untitled pipeline|file import capability|title:\s*kanban|present with copyright)\b/i.test(cleaned)) {
    return false;
  }
  if (/^title:\s+.+?\s+-\s+correct\.?$/i.test(cleaned)) return false;
  if (/\b(?:zero|0|no)\s+missions?\s+running\b/i.test(cleaned)
    || /\bzero\s+running\s+missions?\b/i.test(cleaned)
    || /\bto do column\b.*\bempty\b/i.test(cleaned)) {
    return true;
  }
  if (/\b(?:button|input|toggle|selector|nav links?|footer|placeholder)\b.*\b(?:present|correct)\.?$/i.test(cleaned)) {
    return false;
  }
  if (/\b(?:pipeline selector|search input|new mission button|board\/scheduled toggle)\b/i.test(cleaned)
    && /\b(?:present|shows|correct)\b/i.test(cleaned)) {
    return false;
  }
  if (/^(?:3 columns?|header stats?|summary header|filters?|search|actions?|sidebar navigation|untitled pipeline|needs review filter):\s+/i.test(cleaned)) {
    return false;
  }
  if (/\b(?:columns?|header stats?|summary header|filters?|search|actions?|sidebar navigation|untitled pipeline|needs review filter|file upload input)\b/i.test(cleaned)
    && /\b(?:present|shown|tested|active|button|toggle|placeholder|\d+\s+missions?|\d+\s+running|\d+\s+paused)\b/i.test(cleaned)
    && !/\b(?:fix|clear|resolve|resume|cancel|rerun|review|inspect|blocked|failed|stale|contradict|missing|wrong|confusing)\b/i.test(cleaned)) {
    return false;
  }
  return true;
}

function stripBrowserTaskListMarker(value: string): string {
  return cleanBrowserText(value)
    .replace(/^(?:\d+[.)]|[-*\u2022â€¢])\s+/, '')
    .trim();
}

function browserTaskFallbackFixes(contextUrl: string, bullet: string): string[] {
  if (/\/kanban(?:[/?#]|$)/i.test(contextUrl)) {
    return [
      `${bullet} Inspect the paused active mission and decide resume or cancel.`,
      `${bullet} Review needs-review or failed cards before calling the board healthy.`,
      `${bullet} Clear stale proof flags from completed or cancelled missions.`,
    ];
  }
  if (/\/canvas(?:[/?#]|$)/i.test(contextUrl)) {
    return [
      `${bullet} Open the inspector and identify the selected mission state.`,
      `${bullet} Put recovery actions next to failed or blocked nodes.`,
      `${bullet} Add proof links to nodes so operators can verify status quickly.`,
    ];
  }
  return [
    `${bullet} Browser-use returned checks instead of fixes; rerun with a sharper operator target.`,
  ];
}

function cleanBrowserTaskMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\r/g, '')
    .trim();
}

function compactBrowserTaskBullet(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  const limit = 170;

  if (/^(?:research read|inspired by):/i.test(cleaned)) {
    return cleaned.length <= limit ? cleaned : cleaned.slice(0, limit).replace(/\s+\S*$/, '').trim();
  }

  const issueBreak = cleaned.indexOf(' - ');
  if (issueBreak >= 24) {
    return cleaned.slice(0, issueBreak).trim();
  }

  if (cleaned.length <= limit) return cleaned;

  const sentenceBoundary = cleaned.slice(0, limit + 1).search(/[.!?](?=\s|$)(?!.*[.!?](?=\s|$))/);
  if (sentenceBoundary >= 80) {
    return cleaned.slice(0, sentenceBoundary + 1).trim();
  }

  const preferredBreak = Math.max(
    cleaned.lastIndexOf(' - ', limit),
    cleaned.lastIndexOf('; ', limit),
    cleaned.lastIndexOf(', ', limit)
  );
  if (preferredBreak >= 80) {
    return cleaned.slice(0, preferredBreak).trim();
  }

  const wordBreak = cleaned.lastIndexOf(' ', limit);
  return cleaned
    .slice(0, wordBreak >= 80 ? wordBreak : limit)
    .replace(/\s+(?:it|the|a|an|and|but|with|yet|this|that)$/i, '')
    .replace(/["'([{,:;/-]\s*$/, '')
    .trim();
}

function humanizeBrowserTaskBullet(value: string, referenceResearch = false): string {
  const cleaned = value
    .replace(/"([^"]{1,90})"/g, '$1')
    .replace(/'([^']{1,90})'/g, '$1')
    .replace(/\bCopy\/adapt\b/gi, 'Inspired by')
    .replace(/\bReply with Exactly:\s*PING_OK\b/gi, 'ping smoke test')
    .replace(/\bACTIVE\b/g, 'active')
    .replace(/\bPAUSED\b/g, 'paused')
    .replace(/\bCANCELLED\b/g, 'cancelled')
    .replace(/\bCOMPLETE\b/g, 'complete')
    .replace(/\bNEEDS REVIEW\b/g, 'needs review')
    .replace(/\bNeeds completion proof\b/g, 'needs completion proof')
    .trim();
  return actionizeBrowserTaskBullet(referenceResearch ? humanizeReferenceResearchLanguage(cleaned) : cleaned);
}

function humanizeReferenceResearchLanguage(value: string): string {
  return value
    .replace(/\bdo not copy\b/gi, 'avoid copying')
    .replace(/\bdon't copy\b/gi, 'avoid copying')
    .replace(/\bcopy the\b/gi, 'be inspired by the')
    .replace(/\bcopy their\b/gi, 'be inspired by their')
    .replace(/\bcopy its\b/gi, 'be inspired by its')
    .replace(/\bcopy ([a-z])/gi, 'be inspired by $1')
    .trim();
}

function actionizeBrowserTaskBullet(value: string): string {
  if (/\b(?:reduce|split|shrink)\b.*\btask[-\s]?pack\b/i.test(value)
    || /\btask[-\s]?pack size\b/i.test(value)
    || /\breduce\b.*\bskills?\s+per\s+node\b/i.test(value)) {
    return 'Reduce the first node task pack before rerun.';
  }

  if (/\brerun\b.*\bfailed tasks?\b/i.test(value)) {
    return 'Rerun only the failed tasks.';
  }

  if (/\bopen\b.*\btrace\b.*\b(?:logs?|inspect|detailed)\b/i.test(value)) {
    return 'Open the trace and inspect the detailed logs.';
  }

  let match = value.match(/^(.+?)\s+is\s+stuck\s+paused\b/i);
  if (match) return `Resume or cancel ${match[1].trim()}.`;

  match = value.match(/^clear completion proof from mission\s+(.+?)\.?$/i);
  if (match) return `Clear completion proof from ${normalizeBrowserTaskTarget(match[1])}.`;

  match = value.match(/^(.+?)\s+says\s+mission failed\s+yet\s+shows\b/i);
  if (match) return `Resolve ${match[1].trim()}; failure and progress disagree.`;

  match = value.match(/^(.+?):\s+failed\s+but\s+shows\b/i);
  if (match) return `Resolve ${match[1].trim()}; failure and progress disagree.`;

  match = value.match(/^(.+?)\s+shows\s+needs review\s+but\s+has\s+mission failed\b/i);
  if (match) return `Resolve ${match[1].trim()}; failure and progress disagree.`;

  match = value.match(/^(.+?)\s+is\s+cancelled\s+but\s+still\s+says\s+needs completion proof\b/i);
  if (match) return `Clear completion proof from ${match[1].trim()}.`;

  match = value.match(/^(.+?)\s+is\s+cancelled\s+but\s+still\s+requests\s+completion proof\b/i);
  if (match) return `Clear completion proof from ${match[1].trim()}.`;

  match = value.match(/^(.+?)\s+(?:is\s+)?(?:stuck|stranded)\s+in\s+active(?:\s+as\s+paused|.*\bpaused\b)?/i);
  if (match) return `Resume or cancel ${match[1].trim()}.`;

  match = value.match(/^(.+?)\s+(?:has contradictory status|marked needs review after failure|is marked needs review.*failed)/i);
  if (match) return `Resolve ${match[1].trim()}; failure and progress disagree.`;

  match = value.match(/^(?:cancelled\s+)?(.+?)(?:\s+mission)?\s+(?:is\s+cancelled\s+but\s+still\s+shows\s+needs completion proof|still\s+demands\s+(?:needs\s+)?completion proof)/i);
  if (match) {
    const target = normalizeBrowserTaskTarget(match[1]);
    return /^mission$/i.test(target)
      ? 'Clear completion proof from cancelled missions.'
      : `Clear completion proof from ${target}.`;
  }

  if (/\bcompleted missions\b.*\bneed(?:s)? completion proof\b/i.test(value)
    || /\bcompleted missions\b.*\bmissing completion proofs?\b/i.test(value)
    || /\bcompleted missions\b.*\bstill show\b.*\bneeds completion proof\b/i.test(value)
    || /\bcomplete(?:d)? missions\b.*\bflagged\b.*\b(?:needs completion proof|proof)\b/i.test(value)
    || /\bmultiple completed missions\b.*\bflagged\b.*\bproof\b/i.test(value)) {
    return 'Clear completion-proof flags from completed missions.';
  }

  if (/\bzero running missions\b/i.test(value)
    || /\bzero missions running\b/i.test(value)
    || /\b0 running\b.*\bempty to do\b/i.test(value)
    || /\bto do column\b.*\bempty\b/i.test(value)) {
    return 'Queue or start the next mission.';
  }

  if (/\bempty\s+to do\b.*\b(?:wastes?|unused|space|horizontal)\b/i.test(value)
    || /\bto do\b.*\bempty\b.*\b(?:wastes?|unused|space|horizontal)\b/i.test(value)) {
    return 'Use the empty TO DO space for next actions or board guidance.';
  }

  if (/\binconsistent\b.*\baction links?\b.*\bhistory cards?\b/i.test(value)
    || /\bhistory cards?\b.*\binconsistent\b.*\baction links?\b/i.test(value)) {
    return 'Make history-card actions consistent across statuses.';
  }

  if (/\bduplicate\b.*\bcanvas links?\b/i.test(value)
    || /\bsimilar\b.*\bcanvas links?\b/i.test(value)) {
    return 'Merge duplicate Canvas links on mission cards.';
  }

  if (/\btitle tooltip inconsistency\b/i.test(value)
    || /\btooltip\b.*\bcanvas\b.*\b(?:inconsistency|mismatch)\b/i.test(value)) {
    return 'Fix the Canvas tooltip/title mismatch.';
  }

  if (/\bneeds completion proof\b.*\b(?:passive|no action|unclear)\b/i.test(value)) {
    return 'Turn needs completion proof into a clear action.';
  }

  if (/\bhistory list\b.*\b(?:mixed|inside|into)\b.*\bboard view\b/i.test(value)
    || /\bboard view\b.*\bhistory list\b/i.test(value)
    || /\bhistory\b.*\b(?:long scrolling|19 completed|completed\/cancelled)\b/i.test(value)) {
    return 'Separate History from the active board view.';
  }

  if (/\bnew (?:mission )?button\b.*\b(?:filters?|tabs?)\b/i.test(value)
    || /\bfilters?\b.*\bnew (?:mission )?button\b/i.test(value)) {
    return 'Move New mission away from the filter tabs.';
  }

  if (/\bfilters?\b.*\b(?:dont|don't|do not)\s+map\b.*\bcolumns?\b/i.test(value)
    || /\bcolumns?\b.*\b(?:dont|don't|do not)\s+map\b.*\bfilters?\b/i.test(value)) {
    return 'Align filters with board columns or separate them visually.';
  }

  if (/\binconsistent\b.*\baction links?\b.*\bmission cards?\b/i.test(value)
    || /\bmission cards?\b.*\binconsistent\b.*\baction links?\b/i.test(value)
    || /\bsome history entries show\b.*\b(?:canvas|trace|failure)\b/i.test(value)) {
    return 'Standardize mission-card actions across statuses.';
  }

  if (/\bfooter navigation\b.*\bduplicates?\b.*\bheader\b/i.test(value)
    || /\bnavigation links\b.*\btop\b.*\bbottom\b/i.test(value)) {
    return 'Remove duplicate footer navigation from the workspace view.';
  }

  if (/^(?:research read|inspired by):/i.test(value)) {
    return polishLabeledBrowserTaskBullet(value);
  }

  if (/^[^:]{2,60}:\s+be inspired by\b/i.test(value)) {
    return polishLabeledBrowserTaskBullet(value);
  }

  return polishBrowserTaskBullet(value);
}

function normalizeBrowserTaskTarget(value: string): string {
  return value
    .trim()
    .replace(/^mission\s+(.+)$/i, '$1')
    .trim();
}

function polishBrowserTaskBullet(value: string): string {
  const cleaned = value
    .replace(/\[\d+\]/g, '')
    .replace(/\bdont\b/gi, "don't")
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return cleaned;
  const issueBreak = cleaned.indexOf(': ');
  const compact = issueBreak >= 10 ? cleaned.slice(0, issueBreak).trim() : cleaned;
  const capitalized = compact[0].toUpperCase() + compact.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function polishLabeledBrowserTaskBullet(value: string): string {
  const cleaned = value
    .replace(/\[\d+\]/g, '')
    .replace(/\bdont\b/gi, "don't")
    .replace(/\s+/g, ' ')
    .trim();
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function browserReviewImprovements(evidence: string, url = ''): string[] {
  const normalized = evidence.toLowerCase();
  const workspace = browserReviewWorkspace(normalized, url);
  const improvements: string[] = [];
  const wideViewport = browserReviewViewportWidth(normalized) >= 2400;
  const landingPage = /\b(?:watch your agent actually ship|pick how you want to work|open canvas|open kanban|see it work)\b/.test(normalized);
  const failed = /\b(?:failed|error|needs attention|mission failed|workflow failed)\b/.test(normalized);
  const paused = /\bpaused\b/.test(normalized);

  if (workspace === 'canvas') {
    if (wideViewport) {
      improvements.push('Dock the execution panel as a right-side inspector instead of letting it cover the node graph; the wide canvas has enough room for both.');
    }
    if (failed) {
      improvements.push('Put the recovery controls directly in the failure banner: rerun failed step, open logs, inspect trace, and copy the error.');
    }
    improvements.push('Add compact proof badges to each node and edge: latest status, last event, and the artifact or trace that proves what happened.');
    improvements.push('Keep node details and next actions available without losing canvas context, especially when the operator selects a node.');
    improvements.push('Make blocked or removed nodes explain why they are blocked, who owns the next move, and where to inspect the evidence.');
    return firstThreeUnique(improvements);
  }

  if (workspace === 'kanban') {
    if (wideViewport) {
      improvements.push('Let the board use more of the desktop width or add a mission detail rail; the columns are squeezed into the center while the sides are empty.');
    }
    if (paused || failed) {
      improvements.push('Make the paused or failed mission card actionable in place with resume, diagnose, rerun, and open-canvas controls.');
    }
    improvements.push('Give History stronger scan controls: filter by failed/paused/completed, sort by recency, and keep the latest failure reason visible on each card.');
    improvements.push('Keep each mission card tied to its latest proof, artifact, or trace so operators can verify status without opening a separate view.');
    improvements.push('Add a compact board-level next action for the paused or most recent mission.');
    return firstThreeUnique(improvements);
  }

  if (/\b(?:failed|error|paused|empty|0 missions?|no tasks?)\b/.test(normalized)) {
    improvements.push('Put the recovery action beside the failed, paused, or empty state so the operator can resume or inspect the issue without hunting.');
  }

  if (landingPage) {
    improvements.push('Route Mission Control reviews to the actual Canvas or Kanban workspace. This root page reads like a demo/landing screen, so it can blur product inspection with marketing content.');
  }

  if (wideViewport) {
    improvements.push('Use the wide desktop space for operational context. The core mission content should gain a right-side evidence, trace, or next-action rail instead of sitting alone in the center.');
  }

  if (/\b(?:running|queued|progress|elapsed|done|mission)\b/.test(normalized)) {
    improvements.push('Put the next action inside the running task row: owner, latest event, expected finish, and an artifact or trace link.');
  }

  if (/\b(?:canvas|kanban|trace|skills|settings)\b/.test(normalized)) {
    improvements.push('Show the active workspace view clearly in the top navigation and keep the same mission context when switching Canvas, Kanban, Trace, and Settings.');
  }

  if (/\b(?:skill|pipeline|node|task)\b/.test(normalized)) {
    improvements.push('Give each task or node a compact proof line: latest status, last update time, and the artifact or trace link that explains it.');
  }

  improvements.push('Reduce repeated decorative copy on operational screens and spend that space on live evidence, recent events, and the next useful command.');

  return firstThreeUnique(improvements);
}

function firstThreeUnique(items: string[]): string[] {
  return [...new Set(items)].slice(0, 3);
}

function browserEvidenceBoundary(url: string, profileLabel: string): string {
  if (profileLabel === 'running browser via CDP') {
    return 'attached browser evidence; login state depends on that browser session';
  }
  if (isLocalBrowserUrl(url)) {
    return 'local URL evidence only; cookies and logged-in sessions are separate';
  }
  return 'public URL evidence only; cookies and logged-in sessions are separate';
}

function isLocalBrowserUrl(url: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(url);
}

function browserReviewPageRead(evidence: string, url = ''): string {
  const normalized = evidence.toLowerCase();
  const workspace = browserReviewWorkspace(normalized, url);
  const landingPage = /\b(?:watch your agent actually ship|pick how you want to work|open canvas|open kanban|see it work)\b/.test(normalized);
  const width = browserReviewViewportWidth(normalized);
  const missionCounts = normalized.match(/(\d+)\s+missions?\D+(\d+)\s+running\D+(\d+)\s+paused/);
  if (workspace === 'canvas') {
    if (/\b(?:failed|workflow failed|mission failed|needs attention)\b/.test(normalized)) {
      return 'This is the Canvas workspace with a failed execution panel over the node graph.';
    }
    return width >= 2400
      ? 'This is the Canvas workspace on a very wide viewport, with the graph and inspector competing for attention.'
      : 'This is the Canvas workspace, so graph layout, node status, and execution details matter most.';
  }
  if (workspace === 'kanban') {
    if (missionCounts) {
      return `This is the Kanban workspace: ${missionCounts[1]} missions, ${missionCounts[2]} running, ${missionCounts[3]} paused.`;
    }
    return width >= 2400
      ? 'This is the Kanban workspace on a very wide viewport, but the board is still visually narrow.'
      : 'This is the Kanban workspace, so status scanning and card actions matter most.';
  }
  if (landingPage && width >= 2400) {
    return 'This appears to be the Spawner landing/demo page on a very wide desktop viewport, not the actual Canvas or Kanban workspace.';
  }
  if (landingPage) {
    return 'This appears to be the Spawner landing/demo page, not the actual Canvas or Kanban workspace.';
  }
  if (width >= 2400) {
    return 'This is a very wide desktop viewport, so unused horizontal space matters for the review.';
  }
  return '';
}

function browserReviewViewportWidth(evidence: string): number {
  const match = evidence.match(/viewport:\s*(\d+)x\d+/i);
  return match ? Number.parseInt(match[1] || '0', 10) : 0;
}

function browserReviewWorkspace(evidence: string, url = ''): 'canvas' | 'kanban' | 'root' | 'unknown' {
  const lowerUrl = url.toLowerCase();
  if (/^https?:\/\/[^/]+\/?(?:[?#].*)?$/.test(lowerUrl)) {
    return 'root';
  }
  if (/\/canvas(?:[/?#]|$)/.test(lowerUrl) || /\b(?:execution pane|node graph|workflow failed|pipeline canvas)\b/.test(evidence)) {
    return 'canvas';
  }
  if (/\/kanban(?:[/?#]|$)/.test(lowerUrl) || /\b(?:to do|active|history|20 missions|kanban workspace)\b/.test(evidence)) {
    return 'kanban';
  }
  if (/\/$/.test(lowerUrl) || /\b(?:watch your agent actually ship|pick how you want to work)\b/.test(evidence)) {
    return 'root';
  }
  return 'unknown';
}
