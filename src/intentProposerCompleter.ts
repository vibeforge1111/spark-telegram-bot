// Live provider completer for the intent proposer/classifier.
//
// DEFAULT: the proposer rides the SAME model the bot chats with, via llm.providerComplete (which
// dispatches across codex/claude/anthropic/openai_compat/ollama). So on a Codex/gpt-5.5 stack the
// classifier uses gpt-5.5, on a GLM stack it uses GLM - no second provider to configure or keep
// healthy. An explicit dedicated endpoint (SPARK_INTENT_PROPOSER_BASE_URL + _API_KEY) overrides this
// for later experiments. FAIL-SAFE: any error returns '' so the proposal is null and, on a
// mutation-permitted turn, the veto fails CLOSED to a confirm prompt.

import axios from 'axios';
import { providerComplete } from './llm';
import type { IntentProposerCompleter } from './intentProposerShadow';

function joinUrl(baseUrl: string, pathName: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${pathName.replace(/^\/+/, '')}`;
}

function stripThinkPreamble(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
}

// Some providers intermittently return an EMPTY completion for an otherwise-fine prompt. Empties come
// back fast, so a retry is nearly free and recovers most. This matters because the proposer feeds a
// security veto: a dropped response must not silently become "no opinion". Default 4; override with
// SPARK_INTENT_PROPOSER_ATTEMPTS.
function proposerAttempts(): number {
  const raw = Number(process.env.SPARK_INTENT_PROPOSER_ATTEMPTS);
  if (Number.isFinite(raw) && raw >= 1 && raw <= 6) return Math.floor(raw);
  return 4;
}

const PER_ATTEMPT_TIMEOUT_MS = 9000;
// Generous enough that a reasoning model emitting a short think block before the JSON does not get
// truncated to an empty content field (a cause of the transient empties the retries recover).
const PROPOSER_MAX_TOKENS = 700;

// HARD wall-clock budget across ALL retries. The veto runs synchronously on the (rare) mutation turn,
// so a flaky/slow provider must not hang the turn: once the budget is spent we stop retrying and
// return '' (the veto then fails CLOSED to a fast confirm prompt - safe). Tunable for the live bot.
function proposerDeadlineMs(): number {
  const raw = Number(process.env.SPARK_INTENT_PROPOSER_DEADLINE_MS);
  if (Number.isFinite(raw) && raw >= 3000 && raw <= 30000) return Math.floor(raw);
  return 13000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DedicatedProvider {
  baseUrl: string;
  model: string;
  apiKey: string;
}

// OPTIONAL explicit override: point the classifier at a specific openai_compat endpoint, independent
// of the chat provider. Only used when BOTH base url and key are set (the "use some other model later"
// path). When unset, the proposer uses the same model as chat (llm.providerComplete).
function resolveDedicatedProvider(): DedicatedProvider | null {
  const base = process.env.SPARK_INTENT_PROPOSER_BASE_URL;
  const key = process.env.SPARK_INTENT_PROPOSER_API_KEY;
  if (base && key) {
    return { baseUrl: base, model: process.env.SPARK_INTENT_PROPOSER_MODEL || 'glm-5.1', apiKey: key };
  }
  return null;
}

async function dedicatedComplete(d: DedicatedProvider, system: string, user: string, timeoutMs: number): Promise<string> {
  const res = await axios.post<ChatCompletionsResponse>(
    joinUrl(d.baseUrl, '/chat/completions'),
    {
      model: d.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0,
      max_tokens: PROPOSER_MAX_TOKENS,
      thinking: { type: 'disabled' }
    },
    {
      timeout: timeoutMs,
      headers: { Authorization: `Bearer ${d.apiKey}`, 'Content-Type': 'application/json' }
    }
  );
  const message = res.data.choices?.[0]?.message;
  return stripThinkPreamble(message?.content || message?.reasoning_content || '');
}

export const intentProposerProviderComplete: IntentProposerCompleter = async ({ system, user }) => {
  const dedicated = resolveDedicatedProvider();
  const attempts = proposerAttempts();
  const deadline = proposerDeadlineMs();
  const startedAt = Date.now();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - (Date.now() - startedAt);
    if (remaining < 1500) break; // not enough budget left for a useful attempt -> stop, caller fails closed
    const perAttempt = Math.min(PER_ATTEMPT_TIMEOUT_MS, remaining);
    try {
      // Default path: same model as chat. Override path: the explicit dedicated endpoint.
      const out = dedicated
        ? await dedicatedComplete(dedicated, system, user, perAttempt)
        : stripThinkPreamble(await providerComplete(system, user, { temperature: 0, maxTokens: PROPOSER_MAX_TOKENS, timeoutMs: perAttempt }));
      if (out) return out; // non-empty -> done
    } catch {
      // fall through to retry; final failure returns '' below
    }
    if (attempt < attempts - 1 && deadline - (Date.now() - startedAt) >= 1500) await delay(150);
  }
  return '';
};
