import axios from 'axios';
import { config as loadEnv } from 'dotenv';
import os from 'node:os';
import path from 'node:path';
import { spark } from './spark';

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
   * Get Spark context for the conversation
   */
  async getSparkContext(): Promise<string> {
    const dashboard = await spark.getDashboardStatus();
    if (!dashboard) return '';

    const voice = dashboard.voice;
    const opinions = voice.opinions
      .slice(0, 5)
      .map(o => `- ${o.topic}: ${o.preference}`)
      .join('\n');

    return `
## User Preferences (from Spark)
${opinions || 'Still learning about this user.'}

## Resonance
${dashboard.resonance.icon} ${dashboard.resonance.name} (${dashboard.resonance.score.toFixed(0)}%)
${dashboard.resonance.description}
`.trim();
  },

  /**
   * Chat with the LLM
   */
  async chat(
    userMessage: string,
    conversationHistory: string = '',
    memories: string = ''
  ): Promise<string> {
    const sparkContext = await this.getSparkContext();

    const systemPrompt = `You are Spark, a helpful AI assistant that learns and remembers.
You have access to the user's preferences and conversation history through Spark Intelligence.
Be concise, friendly, and helpful. Respond naturally like a knowledgeable friend.

${sparkContext}

${memories ? `## Relevant Memories\n${memories}` : ''}
${conversationHistory ? `## Recent Conversation\n${conversationHistory}` : ''}

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
            max_tokens: 256
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
        return content || "I'm here, but I couldn't generate a response right now.";
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
