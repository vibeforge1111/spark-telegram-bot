export function renderBuilderMemoryDiagnosticBoundaryReply(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksDiagnostic = /\bmemory\s+diagnostic\b/.test(normalized) || /\bdiagnos(?:e|tic)\b.*\bmemory\b/.test(normalized);
  const asksOnlyIfAuthorized = /\bonly\s+if\b.*\bauthori[sz]es?\b/.test(normalized) || /\botherwise\b.*\bmissing\b/.test(normalized);
  if (!asksDiagnostic || !asksOnlyIfAuthorized) return '';
  return 'This turn does not authorize a memory diagnostic. What is missing is a direct fresh request, such as “run Memory Doctor for the last request,” so Spark can prove the diagnostic was intentionally allowed.';
}
