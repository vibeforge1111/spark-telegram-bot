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
        timeout: 12000,
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          'Content-Type': 'application/json'
        }
      }
    );
    const message = res.data.choices?.[0]?.message;
    return stripThinkPreamble(message?.content || message?.reasoning_content || '');
  } catch {
    return '';
  }
};
