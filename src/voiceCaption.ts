export const TELEGRAM_VOICE_CAPTION_MAX_CHARS = 1024;

type VoiceCaptionInput = {
  responseText?: string;
  spokenText?: string;
  maxChars?: number;
};

export function formatVoiceMediaCaption(input: VoiceCaptionInput): string | undefined {
  const maxChars = input.maxChars ?? TELEGRAM_VOICE_CAPTION_MAX_CHARS;
  const responseCaption = composeCaption(input.responseText || '');
  if (responseCaption) {
    return truncateCaption(responseCaption, maxChars);
  }
  const spokenCaption = composeCaption(input.spokenText || '');
  return spokenCaption ? truncateCaption(spokenCaption, maxChars) : undefined;
}

function composeCaption(value: string): string {
  const normalized = normalizeCaptionText(value);
  if (!normalized) {
    return '';
  }
  if (normalized.includes('\n')) {
    return normalized.replace(/\n{3,}/g, '\n\n');
  }
  if (normalized.length <= 240) {
    return normalized;
  }
  return composeSingleLineCaption(normalized);
}

function normalizeCaptionText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .trim();
}

function composeSingleLineCaption(value: string): string {
  const sentences = splitSentences(value);
  if (sentences.length <= 1) {
    return value;
  }

  const units: string[] = [];
  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const next = sentences[index + 1];
    if (next && isShortLabelSentence(sentence)) {
      units.push(`${sentence} ${next}`);
      index += 1;
      continue;
    }
    units.push(sentence);
  }

  const paragraphs: string[] = [];
  let current: string[] = [];
  let currentChars = 0;
  for (const unit of units) {
    const wouldExceed = currentChars + unit.length + (current.length ? 1 : 0) > 320;
    if (current.length && (current.length >= 2 || wouldExceed)) {
      paragraphs.push(current.join(' '));
      current = [];
      currentChars = 0;
    }
    current.push(unit);
    currentChars += unit.length + (current.length > 1 ? 1 : 0);
  }
  if (current.length) {
    paragraphs.push(current.join(' '));
  }
  return paragraphs.join('\n\n');
}

function splitSentences(value: string): string[] {
  return value.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [value];
}

function isShortLabelSentence(value: string): boolean {
  const stripped = value.replace(/[.!?]+$/g, '').trim();
  return stripped.length > 0 && stripped.length <= 36 && !stripped.includes(',');
}

function truncateCaption(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 3) {
    return value.slice(0, maxChars);
  }

  const marker = '...';
  const limit = maxChars - marker.length;
  let slice = value.slice(0, limit).trimEnd();
  const paragraphCut = slice.lastIndexOf('\n\n');
  if (paragraphCut >= Math.floor(limit * 0.55)) {
    slice = slice.slice(0, paragraphCut).trimEnd();
  } else {
    const sentenceCut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
    if (sentenceCut >= Math.floor(limit * 0.55)) {
      slice = slice.slice(0, sentenceCut + 1).trimEnd();
    }
  }
  return `${slice.replace(/[.!?,;:\s]+$/g, '')}${marker}`.slice(0, maxChars);
}
