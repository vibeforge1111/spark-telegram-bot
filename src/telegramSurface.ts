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
