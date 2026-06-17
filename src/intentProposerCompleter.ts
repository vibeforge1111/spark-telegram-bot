// Live provider completer for the shadow intent proposer (Phase 1, observe-only).
//
// Kept in its own file so the entangled llm.ts is untouched. Reuses the exported
// resolveChatProviderConfig and does a minimal raw chat-completions POST (the live provider is the
// openai_compat path = GLM via Z.AI). It is FAIL-SAFE: any non-openai_compat provider or any error
// returns '' so the proposer yields a null proposal and the handler is never affected. It is only
// ever invoked behind the SPARK_INTENT_PROPOSER_SHADOW env gate, fire-and-forget, off the hot path.

import axios from 'axios';
import { resolveChatProviderConfig } from './llm';
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

// GLM intermittently returns an EMPTY completion for an otherwise-fine prompt (observed ~1-in-3 on
// some turns). Empties come back instantly, so a retry is nearly free and recovers the vast majority.
// This matters because the proposer now feeds a security veto: a dropped response must not silently
// become "no opinion". Default 3 attempts; override with SPARK_INTENT_PROPOSER_ATTEMPTS.
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

const ZAI_DEFAULT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4/';

interface ProposerProvider {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

// The proposer is an intent CLASSIFIER, not the chat brain - it wants a cheap, fast model and an
// openai_compat endpoint, and it must NOT be coupled to whatever heavy model the bot chats with
// (codex/gpt-5.5, anthropic, etc.). So resolve a dedicated provider in priority order:
//   1. dedicated SPARK_INTENT_PROPOSER_* (explicit, lets the operator point the classifier anywhere)
//   2. ZAI/GLM if configured (the natural fast classifier) - even when main chat is on another backend
//   3. fall back to the main chat provider ONLY if it is already openai_compat
// Returns null if no openai_compat classifier is reachable (then the proposal is null and, on a
// mutation-permitted turn, the veto fails CLOSED to a confirm prompt).
function resolveProposerProvider(): ProposerProvider | null {
  const env = process.env;
  const dedicatedBase = env.SPARK_INTENT_PROPOSER_BASE_URL;
  const dedicatedKey = env.SPARK_INTENT_PROPOSER_API_KEY;
  if (dedicatedBase && dedicatedKey) {
    return { baseUrl: dedicatedBase, model: env.SPARK_INTENT_PROPOSER_MODEL || env.ZAI_MODEL || 'glm-5.1', apiKey: dedicatedKey };
  }
  if (env.ZAI_API_KEY) {
    return { baseUrl: env.ZAI_BASE_URL || ZAI_DEFAULT_BASE_URL, model: env.ZAI_MODEL || 'glm-5.1', apiKey: env.ZAI_API_KEY };
  }
  try {
    const cfg = resolveChatProviderConfig();
    if (cfg.kind === 'openai_compat' && cfg.baseUrl) {
      return { baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey };
    }
  } catch {
    // fall through to null
  }
  return null;
}

export const intentProposerProviderComplete: IntentProposerCompleter = async ({ system, user }) => {
  const provider = resolveProposerProvider();
  if (!provider) return '';
  const attempts = proposerAttempts();
  const deadline = proposerDeadlineMs();
  const startedAt = Date.now();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - (Date.now() - startedAt);
    if (remaining < 1500) break; // not enough budget left for a useful attempt -> stop, caller fails closed
    try {
      const res = await axios.post<ChatCompletionsResponse>(
        joinUrl(provider.baseUrl, '/chat/completions'),
        {
          model: provider.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0,
          max_tokens: PROPOSER_MAX_TOKENS,
          thinking: { type: 'disabled' }
        },
        {
          timeout: Math.min(PER_ATTEMPT_TIMEOUT_MS, remaining),
          headers: {
            ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
            'Content-Type': 'application/json'
          }
        }
      );
      const message = res.data.choices?.[0]?.message;
      const out = stripThinkPreamble(message?.content || message?.reasoning_content || '');
      if (out) return out; // non-empty -> done
    } catch {
      // fall through to retry; final failure returns '' below
    }
    if (attempt < attempts - 1 && deadline - (Date.now() - startedAt) >= 1500) await delay(150);
  }
  return '';
};
