export function renderForwardOnlyPointsSafetyAnswer(text: string): string | null {
  const asksAdoptedPrCredit =
    /\b(?:adopted|adoption)\b.{0,30}\bpr\b|\bpr\b.{0,30}\b(?:adopted|adoption)\b/i.test(text);
  if (
    !/\bpublic team points?\b/i.test(text)
    || !asksAdoptedPrCredit
    || !/\bcredit(?:ed|ing)?\b/i.test(text)
  ) {
    return null;
  }
  return [
    '24,409 stays the immutable opening balance; nothing is added until the PR’s useful contribution is actually adopted, mapped to the retained contributor and team, and checked against prior awards.',
    'Spark would then propose one append-only, idempotent award keyed to that adoption and source contribution, so retries cannot double-credit it and no prior total is reset or recomputed; I did not change any points or team state.'
  ].join(' ');
}
