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
// TODO(spark-compete-qa): Command list overwhelms new users - QA 2026-05-24
// Bug: Bot returns 24 commands at once when user asks for command list.
// Destructive commands like /forget all listed with no warning.
// No prioritization or start here guidance for new users.
//
// Before:
//   User: "Show me the list of all commands I can use"
//   Bot: Returns 24 commands across 5 categories with no prioritization.
//   /forget all listed casually with no destructive warning.
//
// After:
//   User: "Show me the list of all commands I can use"
//   Bot: "Here are the most useful commands to start:
//        /diagnose - check everything is working
//        /run <goal> - start a mission
//        /board - see mission status
//        /remember <text> - save something
//        /recall <topic> - search memory
//        Type 'more commands' to see the full list.
//        WARNING: /forget all permanently deletes all memory."
//
// Fix needed:
//   1. Show only 5 essential commands on first request
//   2. Offer more commands option to see full list
//   3. Mark /forget all with WARNING label
//   4. Add start here guidance for new users
