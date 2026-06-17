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
  if (Number.isFinite(raw) && raw >= 1 && raw <= 5) return Math.floor(raw);
  return 3;
}

const PER_ATTEMPT_TIMEOUT_MS = 9000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const intentProposerProviderComplete: IntentProposerCompleter = async ({ system, user }) => {
  let config;
  try {
    config = resolveChatProviderConfig();
  } catch {
    return '';
  }
  // The shadow proposer only drives the live (openai_compat) provider. Other backends (codex/claude
  // CLIs, anthropic API) are not wired here on purpose - they return '' and the proposal is null.
  if (config.kind !== 'openai_compat' || !config.baseUrl) return '';
  const attempts = proposerAttempts();
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await axios.post<ChatCompletionsResponse>(
        joinUrl(config.baseUrl, '/chat/completions'),
        {
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0,
          max_tokens: 400,
          thinking: { type: 'disabled' }
        },
        {
          timeout: PER_ATTEMPT_TIMEOUT_MS,
          headers: {
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
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
    if (attempt < attempts - 1) await delay(150);
  }
  return '';
};
