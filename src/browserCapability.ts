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

export function renderBrowserUseReviewAnswer(
  intent: BrowserCapabilityIntent,
  payload: Record<string, unknown>
): string {
  const ok = payload.ok === true || String(payload.status || '') === 'ready';
  const failure = String(payload.last_failure_reason || '').trim();
  const url = String(payload.final_url || payload.url || intent.url || '').trim();
  const title = String(payload.title || '').trim();
  const text = String(payload.text_excerpt || '').trim();
  const state = String(payload.state_excerpt || '').trim();
  const bullet = '\u2022';

  if (!ok) {
    return [
      'Browser-use could not review the page.',
      '',
      'Why',
      `${bullet} ${failure || 'No passing browser-use receipt was returned.'}`
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
    '3 UX improvements',
    ...improvements.map((item, index) => `${index + 1}. ${item}`),
    '',
    'Evidence used',
    `${bullet} screenshot capture`,
    `${bullet} visible text and page state from this run`
  );
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
    return improvements.slice(0, 3);
  }

  if (workspace === 'kanban') {
    if (wideViewport) {
      improvements.push('Let the board use more of the desktop width or add a mission detail rail; the columns are squeezed into the center while the sides are empty.');
    }
    if (paused || failed) {
      improvements.push('Make the paused or failed mission card actionable in place with resume, diagnose, rerun, and open-canvas controls.');
    }
    improvements.push('Give History stronger scan controls: filter by failed/paused/completed, sort by recency, and keep the latest failure reason visible on each card.');
    return improvements.slice(0, 3);
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

  return [...new Set(improvements)].slice(0, 3);
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
