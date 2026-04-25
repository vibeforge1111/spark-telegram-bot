import axios from 'axios';
import { config as loadEnv } from 'dotenv';
import os from 'node:os';
import path from 'node:path';

loadEnv({ path: path.join(os.homedir(), '.env.zai'), override: false, quiet: true });

const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4/';
const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-5.1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.5:cloud';

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

interface ZaiChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
}

function joinUrl(baseUrl: string, pathName: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${pathName.replace(/^\/+/, '')}`;
}

export const llm = {
  /**
   * Check if the configured LLM is available.
   */
  async isAvailable(): Promise<boolean> {
    if (ZAI_API_KEY) {
      try {
        const res = await axios.get(joinUrl(ZAI_BASE_URL, '/models'), {
          timeout: 5000,
          headers: {
            Authorization: `Bearer ${ZAI_API_KEY}`
          }
        });
        return Array.isArray(res.data?.data) || Array.isArray(res.data?.models);
      } catch {
        return false;
      }
    }

    try {
      const res = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 2000 });
      return Array.isArray(res.data?.models);
    } catch {
      return false;
    }
  },

  /**
   * Chat with the LLM
   */
  async chat(
    userMessage: string,
    conversationHistory: string = '',
    memories: string = ''
  ): Promise<string> {
    const systemPrompt = `You are Spark, the user's personal operator and thinking partner. Not a generic assistant.
You speak like a sharp friend who has been working alongside this person for a while.
Lead with the answer, the call, or the next move in the first sentence. No hedges, no throat clearing, no restating the question.
Be warm but high-signal. No filler, no performative enthusiasm, no canned check-ins like "How can I help today?".
Continue the conversation from the user's actual message and prior context. Do not reset to a greeting.
Reply briefly by default. Match length to what the question actually needs.
Never use em dashes (—). Use a hyphen, a comma, a period, or a colon instead.
Never name internal subsystems to the user. Do not mention "Spark Intelligence", "memory bridge", "router", or similar plumbing.
If something internal failed, speak as the agent: say what you cannot do right now and what the user can try.

${memories ? `## What I remember\n${memories}` : ''}
${conversationHistory ? `## Where we left off\n${conversationHistory}` : ''}

Keep responses brief (1-3 sentences) unless the user asks for detail.`;

    try {
      if (ZAI_API_KEY) {
        const res = await axios.post<ZaiChatResponse>(
          joinUrl(ZAI_BASE_URL, '/chat/completions'),
          {
            model: ZAI_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 384,
            thinking: { type: 'disabled' }
          },
          {
            timeout: 60000,
            headers: {
              Authorization: `Bearer ${ZAI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const content = res.data.choices?.[0]?.message?.content?.trim();
        const reasoningContent = res.data.choices?.[0]?.message?.reasoning_content?.trim();
        return content || reasoningContent || "I'm here, but I couldn't generate a response right now.";
      }

      const res = await axios.post<OllamaResponse>(
        `${OLLAMA_URL}/api/generate`,
        {
          model: MODEL,
          prompt: userMessage,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 256,
          },
        },
        { timeout: 30000 }
      );

      return res.data.response.trim();
    } catch (err) {
      console.error('LLM error:', err);
      return "I'm having trouble thinking right now. Try again in a moment.";
    }
  },
};
