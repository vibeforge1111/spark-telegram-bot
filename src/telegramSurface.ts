export function isPlainWordsSurfaceRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bplain words?\b/.test(normalized) ||
    /\bno headings?\b/.test(normalized) ||
    /\bno bullets?\b/.test(normalized) ||
    /\bone or two\b.{0,40}\b(?:sentences|paragraphs)\b/.test(normalized) ||
    /\bnatural teammate\b/.test(normalized)
  );
}

function isStrictSurfaceCompressionRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\bno headings?\b/.test(normalized) ||
    /\bno bullets?\b/.test(normalized) ||
    /\bone or two\b.{0,40}\b(?:sentences|paragraphs)\b/.test(normalized) ||
    /\bnatural teammate\b.{0,40}\b(?:sentences|paragraphs)\b/.test(normalized)
  );
}

function isHeadingLikeParagraph(paragraph: string): boolean {
  const compact = paragraph.trim();
  return (
    /^the sharp v\d*\s*:?$/i.test(compact) ||
    /^v\d+\s*:?$/i.test(compact) ||
    /^[A-Z][A-Za-z0-9 /-]{2,70}:$/.test(compact)
  );
}

function containsListStructure(paragraph: string): boolean {
  return /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S/.test(paragraph);
}

export function applyPlainWordsSurfaceRequest(userText: string, replyText: string): string {
  if (!isPlainWordsSurfaceRequest(userText) || !replyText.trim()) {
    return replyText;
  }
  if (!isStrictSurfaceCompressionRequest(userText)) {
    return replyText;
  }

  const paragraphs = replyText
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    if (isHeadingLikeParagraph(paragraph) || containsListStructure(paragraph)) {
      break;
    }
    kept.push(paragraph);
    if (kept.length >= 2) break;
  }

  return kept.length ? kept.join('\n\n') : replyText;
}

export interface TelegramHumanReadabilityScore {
  score: number;
  issues: string[];
}

function paragraphWordCounts(text: string): number[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => paragraph.split(/\s+/).filter(Boolean).length);
}

export function scoreLoopEngineeringTelegramReadability(replyText: string): TelegramHumanReadabilityScore {
  const text = String(replyText || '').replace(/\r\n/g, '\n').trim();
  const issues: string[] = [];
  let score = 10;
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const wordCounts = paragraphWordCounts(text);
  const labelLineCount = text
    .split('\n')
    .filter((line) => /^[A-Z][A-Za-z0-9 /-]{2,34}:\s+\S/.test(line.trim()))
    .length;

  if (!text) {
    return { score: 0, issues: ['empty_reply'] };
  }
  if (paragraphs.length < 2) {
    score -= 2;
    issues.push('needs_paragraph_spacing');
  }
  if (wordCounts.some((count) => count > 42)) {
    score -= 1;
    issues.push('paragraph_too_dense');
  }
  if (text.length > 900) {
    score -= 1;
    issues.push('too_long_for_telegram_followup');
  }
  if (paragraphs.length > 5) {
    score -= 1;
    issues.push('too_many_paragraphs_for_natural_reply');
  }
  if (labelLineCount > 4) {
    score -= 2;
    issues.push('too_many_label_lines');
  } else if (labelLineCount > 2) {
    score -= 1;
    issues.push('label_lines_should_be_sparse');
  }
  if (/(?:^|\n)(?:Mission|Provider|Move|Status)\s*:/i.test(text)) {
    score -= 2;
    issues.push('report_card_headings');
  }
  if (/Advanced PRD|router boundaries|DCL scaffold|external API calls?|raw command|trace id|local path/i.test(text)) {
    score -= 1;
    issues.push('internal_or_jargony_copy');
  }
  if (/(?:Domain Chip|Loop Engineering)/i.test(text) && !/\b(?:private|read-only|nothing was|not activated|not published|kept .*private)\b/i.test(text)) {
    score -= 1;
    issues.push('missing_boundary_reassurance');
  }
  if (/(?:Domain Chip|Loop Engineering)/i.test(text) && !/\b(?:next|say "|ask|open|spawner|details|proof checklist)\b/i.test(text)) {
    score -= 1;
    issues.push('missing_next_step');
  }
  const rawSlugMatches = [...text.matchAll(/\b(?:domain-chip|mission|trace|looprun|benchcase)-[a-z0-9][a-z0-9-]{5,}\b/gi)]
    .filter((match) => {
      const index = match.index ?? 0;
      const before = text.slice(Math.max(0, index - 26), index).toLowerCase();
      return !before.endsWith('/loop-engineering/');
    })
    .map((match) => match[0]);
  const routingReceiptSlugOnly = rawSlugMatches.length === 1 && /^Domain Chip created:\s*domain-chip-/i.test(text);
  if (rawSlugMatches.length > 0 && !routingReceiptSlugOnly) {
    score -= 1;
    issues.push('raw_identifier_visible');
  }
  if (/[^\n]\n[^\n]/.test(text) && !/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+\S/.test(text)) {
    score -= 1;
    issues.push('single_newline_blob');
  }

  return { score: Math.max(0, score), issues };
}

export function assertLoopEngineeringTelegramReadability(
  replyText: string,
  minimumScore = 8
): TelegramHumanReadabilityScore {
  const result = scoreLoopEngineeringTelegramReadability(replyText);
  if (result.score < minimumScore) {
    throw new Error(`Loop Engineering Telegram copy scored ${result.score}/${minimumScore}: ${result.issues.join(', ')}`);
  }
  return result;
}
