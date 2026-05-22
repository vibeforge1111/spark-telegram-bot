/**
 * Encoding detection layer for prompt injection defense.
 *
 * Scans incoming user text for signals that an attacker may be
 * trying to smuggle instructions past normal keyword filters by
 * wrapping them in encoding layers (base64, URL-encoding,
 * Morse code, simple ciphers, Unicode homoglyphs, etc.).
 *
 * Detection is heuristic — false positives are logged as warnings
 * and the message is still forwarded. The goal is visibility, not
 * silent blocking, so upstream policy gates remain authoritative.
 */

export type EncodingType =
  | 'base64'
  | 'morse'
  | 'rot13'
  | 'url_encoded'
  | 'unicode_homoglyph';

export interface EncodingHit {
  type: EncodingType;
  value: string;
  confidence: number;
}

export interface DetectionResult {
  hits: EncodingHit[];
  hasEncodedContent: boolean;
  decodedSummary: string;
}

/* ------------------------------------------------------------------ */
/*  Base64                                                            */
/* ------------------------------------------------------------------ */

const BASE64_RE = /(?:[A-Za-z0-9+\/]{16,}(?:={0,2})?)/g;

function isLikelyBase64(candidate: string): boolean {
  if (candidate.length < 16) return false;
  if (/^[a-z]+$/i.test(candidate) && candidate.length < 24) return false;

  const decoded = Buffer.from(candidate, 'base64').toString('utf8');
  const printable = Array.from(decoded).filter((ch) => {
    const code = ch.charCodeAt(0);
    return (code >= 32 && code <= 126) || code === 9 || code === 10;
  }).length;
  const ratio = decoded.length > 0 ? printable / decoded.length : 0;
  return ratio > 0.85;
}

export function detectBase64(text: string): EncodingHit[] {
  const hits: EncodingHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = BASE64_RE.exec(text)) !== null) {
    const candidate = match[0];
    if (isLikelyBase64(candidate)) {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8');
      const confidence = decoded.length >= 20 ? 0.9 : 0.7;
      hits.push({ type: 'base64', value: candidate, confidence });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/*  Morse code                                                        */
/* ------------------------------------------------------------------ */

const MORSE_RE = /(?:[.\-\u2013\u2014]{1,8}(?:[ \t\/]+[.\-\u2013\u2014]{1,8}){4,})/g;

const MORSE_MAP: Record<string, string> = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
  '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
  '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
  '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
  '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
  '--..': 'Z',
  '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4',
  '.....': '5', '-....': '6', '--...': '7', '---..': '8', '----.': '9',
  '..--.-': '_', '.-.-.-': '.', '--..--': ',', '..--..': '?',
  '---.': ':', '-..-.': '/', '-.-.--': '!', '.-...': '&',
};

function decodeMorse(morseStr: string): string {
  return morseStr
    .split(/[ \t\/]+/)
    .map((ch) => MORSE_MAP[ch] ?? '?')
    .join('');
}

export function detectMorse(text: string): EncodingHit[] {
  const hits: EncodingHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = MORSE_RE.exec(text)) !== null) {
    const decoded = decodeMorse(match[0]);
    const alphaRatio = Array.from(decoded).filter((c) => c !== '?').length / decoded.length;
    if (alphaRatio > 0.7 && decoded.length >= 5) {
      hits.push({ type: 'morse', value: match[0], confidence: 0.75 });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/*  ROT13 / ROT-N ciphers                                             */
/* ------------------------------------------------------------------ */

function rotN(text: string, n: number): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + n) % 26) + 65);
      if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + n) % 26) + 97);
      return ch;
    })
    .join('');
}

const ENGLISH_FREQ = /[^ETAOINSHRDLCU]/gi;

function englishLikelihood(text: string): number {
  if (text.length === 0) return 0;
  const matches = text.match(ENGLISH_FREQ)?.length ?? 0;
  return 1 - matches / text.length;
}

const ROT_CHECK_BATCHES: Array<{ label: string; shift: number }> = [
  { label: 'rot13', shift: 13 },
  { label: 'rot5', shift: 5 },
  { label: 'rot7', shift: 7 },
  { label: 'rot47', shift: 47 },
];

export function detectRotCiphers(text: string): EncodingHit[] {
  const hits: EncodingHit[] = [];
  // Match sequences of words (letters and spaces) that are at least 20 chars total
  const candidates = text.match(/[A-Za-z][A-Za-z ]{19,}/g) ?? [];
  for (const candidate of candidates) {
    for (const { label, shift } of ROT_CHECK_BATCHES) {
      const decoded = rotN(candidate, shift);
      const likelihood = englishLikelihood(decoded);
      if (likelihood > 0.45) {
        hits.push({ type: 'rot13', value: `${label}:${candidate.slice(0, 40)}`, confidence: likelihood });
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/*  URL-encoded content                                               */
/* ------------------------------------------------------------------ */

const URL_ENC_RE = /%(?:[0-9A-Fa-f]{2}){3,}/g;

export function detectUrlEncoded(text: string): EncodingHit[] {
  const hits: EncodingHit[] = [];
  let match: RegExpExecArray | null;
  while ((match = URL_ENC_RE.exec(text)) !== null) {
    try {
      const decoded = decodeURIComponent(match[0]);
      const printable = Array.from(decoded).every((ch) => ch.charCodeAt(0) >= 32);
      if (printable) {
        hits.push({ type: 'url_encoded', value: match[0], confidence: 0.85 });
      }
    } catch {
      // invalid percent sequence, skip
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/*  Unicode homoglyphs                                                */
/* ------------------------------------------------------------------ */

const HOMOGLYPH_MAP: Record<string, string> = {
  '\u0410': 'A', '\u0430': 'a', '\u0412': 'B', '\u0432': 'b',
  '\u0415': 'E', '\u0435': 'e', '\u041A': 'K', '\u043A': 'k',
  '\u041C': 'M', '\u043C': 'm', '\u041D': 'H', '\u043D': 'h',
  '\u041E': 'O', '\u043E': 'o', '\u0420': 'P', '\u0440': 'p',
  '\u0421': 'C', '\u0441': 'c', '\u0422': 'T', '\u0442': 't',
  '\u0423': 'Y', '\u0443': 'y', '\u0425': 'X', '\u0445': 'x',
  '\u0391': 'A', '\u03B1': 'a', '\u0392': 'B', '\u03B2': 'b',
  '\u0395': 'E', '\u03B5': 'e', '\u0397': 'H', '\u03B7': 'h',
  '\u0399': 'I', '\u03B9': 'i', '\u039A': 'K', '\u03BA': 'k',
  '\u039C': 'M', '\u03BC': 'm', '\u039D': 'N', '\u03BD': 'n',
  '\u039F': 'O', '\u03BF': 'o', '\u03A1': 'P', '\u03C1': 'p',
  '\u03A3': 'S', '\u03C3': 's', '\u03A4': 'T', '\u03C4': 't',
  '\u03A5': 'Y', '\u03C5': 'y', '\u03A7': 'X', '\u03C7': 'x',
};

export function detectHomoglyphs(text: string): EncodingHit[] {
  const hits: EncodingHit[] = [];
  const homoglyphs = Array.from(text).filter((ch) => ch in HOMOGLYPH_MAP);
  if (homoglyphs.length >= 3) {
    hits.push({
      type: 'unicode_homoglyph',
      value: `${homoglyphs.length} suspicious unicode chars`,
      confidence: Math.min(0.95, 0.5 + homoglyphs.length * 0.1),
    });
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function detectEncodings(text: string): DetectionResult {
  if (!text || text.length === 0) {
    return { hits: [], hasEncodedContent: false, decodedSummary: '' };
  }

  const hits: EncodingHit[] = [
    ...detectBase64(text),
    ...detectMorse(text),
    ...detectRotCiphers(text),
    ...detectUrlEncoded(text),
    ...detectHomoglyphs(text),
  ];

  const seen = new Set<string>();
  const deduped = hits.filter((h) => {
    const key = `${h.type}:${h.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const decodedSummary = deduped
    .map((h) => `[${h.type} conf=${h.confidence.toFixed(2)}] ${h.value.slice(0, 80)}`)
    .join('\n');

  return {
    hits: deduped,
    hasEncodedContent: deduped.length > 0,
    decodedSummary,
  };
}
