/**
 * LLM Client - Ollama with Kimi 2.5
 * Provides natural language responses using Spark context
 */

import axios from 'axios';
import { spark } from './spark';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.5:cloud';

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

export const llm = {
  /**
   * Check if Ollama is available
   */
  async isAvailable(): Promise<boolean> {
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
