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
  if (profileLabel) {
    lines.push('', 'Profile', `${bullet} ${profileLabel} requested`);
  }
  lines.push('', 'Boundary', `${bullet} ${browserEvidenceBoundary(url, profileLabel)}`);
  return lines.join('\n');
}

export function renderBrowserUseTaskAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const failure = String(payload.last_failure_reason || '').trim();
  const finalResult = boundedTelegramText(cleanBrowserText(String(payload.final_result || '').trim()), 900);
  const urls = arrayOfStrings(payload.urls).slice(0, 4);
  const steps = Number(payload.number_of_steps || 0);
  const screenshots = arrayOfStrings(payload.screenshot_paths);
  const profileLabel = browserUsePayloadProfileLabel(payload, intent.profile);
  const bullet = '\u2022';

  if (!ok) {
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

  const lines = [
    'Browser-use finished the browser run.',
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
  if (profileLabel) {
    lines.push('', 'Profile', `${bullet} ${profileLabel} requested`);
  }
  return lines.join('\n');
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
    'Browser-use reviewed the live page.',
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
    'What I would improve',
    ...improvements.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Evidence',
    `${bullet} screenshot capture`,
    `${bullet} visible text and page state from this run`
  );
  if (profileLabel) {
    lines.push('', 'Profile', `${bullet} ${profileLabel} requested`);
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
