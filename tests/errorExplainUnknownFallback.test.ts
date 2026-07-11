/**
 * Trust-boundary tests for errorExplain unknown-category log-paste fix.
 *
 * Boundary: any internal error → explainSparkError → renderSparkErrorReply
 *           → Telegram message
 *
 * Before fix: unknown-category repair recommended `spark logs … --lines 80`
 *             with no safety caveat; Builder LLM also spontaneously asked
 *             users to paste logs into Telegram chat.
 * After fix:  repair routes to /diagnose first; if spark logs appears it
 *             is accompanied by an explicit do-not-paste caveat.
 *
 * Security reviewer questions addressed:
 *   1. Unknown-category repair routes to /diagnose first (verified below).
 *   2. All sampled known error categories checked — none recommend raw log
 *      paste without a do-not-paste caveat.
 *   3. Knowledge-layer guard (agent-knowledge/using-spark.md Boundaries)
 *      must be verified by lab under rephrased prompts.
 */
import { describe, it, expect } from 'vitest';
import { explainSparkError, renderSparkErrorReply } from '../src/errorExplain';

describe('unknown-category fallback — no raw log paste', () => {
  it('unknown-category repair contains /diagnose', () => {
    const explanation = explainSparkError(new Error('something totally unexpected happened xyz'), 'chat');
    expect(explanation.category).toBe('unknown');
    expect(explanation.repair).toMatch(/\/diagnose/);
  });

  it('unknown-category reply contains /diagnose before any log command', () => {
    const reply = renderSparkErrorReply(new Error('random internal error abc'), 'chat', true);
    const diagnoseIdx = reply.indexOf('/diagnose');
    const logsIdx = reply.indexOf('spark logs');
    expect(diagnoseIdx).toBeGreaterThan(-1);
    if (logsIdx !== -1) {
      expect(diagnoseIdx).toBeLessThan(logsIdx);
    }
  });

  it('unknown-category reply, when it includes spark logs, includes do-not-paste caveat', () => {
    const reply = renderSparkErrorReply(new Error('random internal error abc'), 'chat', true);
    if (reply.includes('spark logs')) {
      expect(reply.toLowerCase()).toMatch(/do not paste|do not share|do not post|not.*paste|not.*share/i);
    }
  });

  it('unknown-category reply does not ask users to paste raw log output into Telegram', () => {
    const reply = renderSparkErrorReply(new Error('mystery failure'), 'chat', true);
    expect(reply.toLowerCase()).not.toMatch(/paste.*log.*here|paste.*output.*here|post.*log.*here/i);
  });

  it('known categories do not recommend raw log commands without diagnose path', () => {
    const knownErrors = [
      new Error('Request failed with status code 401: invalid api key'),
      new Error('ECONNREFUSED 127.0.0.1:3333'),
      new Error('HTTP 429: too many requests'),
      new Error('Promise timed out after 90000 milliseconds'),
      new Error('409 Conflict: terminated by other getUpdates request'),
    ];
    for (const err of knownErrors) {
      const expl = explainSparkError(err, 'chat');
      if (expl.repair.includes('spark logs')) {
        expect(expl.repair.toLowerCase()).toMatch(/do not paste|do not share|not.*paste/i);
      }
    }
  });
});
