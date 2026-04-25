import axios from 'axios';
import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

loadEnv({ path: path.join(os.homedir(), '.env.zai'), override: false, quiet: true });

const ZAI_API_KEY = process.env.ZAI_API_KEY;
const ZAI_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4/';
const ZAI_MODEL = process.env.ZAI_MODEL || 'glm-5.1';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.5:cloud';
const CODEX_MODEL = process.env.CODEX_MODEL || process.env.SPARK_CODEX_MODEL || process.env.OPENAI_MODEL || 'gpt-5.5';
const CODEX_PATH = process.env.CODEX_PATH || process.env.SPARK_CODEX_PATH || 'codex';

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

export function isCodexProvider(value: string | undefined = process.env.LLM_PROVIDER || process.env.SPARK_LLM_PROVIDER): boolean {
  return (value || '').trim().toLowerCase() === 'codex';
}

export function codexExecArgs(model: string, outputPath: string): string[] {
  return [
    'exec',
    '--skip-git-repo-check',
    '--model',
    model,
    '--sandbox',
    'read-only',
    '--output-last-message',
    outputPath,
    '-',
  ];
}

const SPARK_SYSTEM_PRIMER = `## What Spark can do in this install
Spark is the user's local agent stack. It has:
- Telegram chat as the front door for normal messages and commands.
- Builder as the reasoning, routing, identity, and memory runtime.
- domain-chip-memory as the default memory substrate for saving, recalling, and checking memory quality.
- Spark Researcher for research, advisory work, evidence packets, and domain-chip authoring.
- Spawner UI / Mission Control for creating and tracking build missions, projects, and execution workflows.

Useful commands the user can try:
- /remember <text>: save an important preference or fact.
- /recall <topic>: search memory.
- /run <goal>: start a mission in Spawner UI.
- /board: check mission state.
- /diagnose: run a stack health check.

When the user asks what Spark knows or can do, explain these capabilities plainly and briefly. Do not pretend a tool succeeded unless it actually did.`;

export function buildSparkChatSystemPrompt(conversationHistory: string = '', memories: string = ''): string {
  return `You are Spark, the user's personal operator and thinking partner. Not a generic assistant.
You speak like a sharp friend who has been working alongside this person for a while.
Lead with the answer, the call, or the next move in the first sentence. No hedges, no throat clearing, no restating the question.
Be warm but high-signal. No filler, no performative enthusiasm, no canned check-ins like "How can I help today?".
Continue the conversation from the user's actual message and prior context. Do not reset to a greeting.
Reply briefly by default. Match length to what the question actually needs.
Never use em dashes (-). Use a hyphen, a comma, a period, or a colon instead.
Use Spark module names only when the user asks what Spark can do, asks about setup, or needs troubleshooting. Otherwise keep subsystem details out of normal chat.
If something internal failed, speak as the agent: say what you cannot do right now and what the user can try.

${SPARK_SYSTEM_PRIMER}
${memories ? `## What I remember\n${memories}` : ''}
${conversationHistory ? `## Where we left off\n${conversationHistory}` : ''}

Keep responses brief (1-3 sentences) unless the user asks for detail.`;
}

function runProcess(command: string, args: string[], input: string, timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      resolve({ ok: false, stdout, stderr: `${stderr}\ncommand timed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.stdin?.end(input);
  });
}

async function codexAvailable(): Promise<boolean> {
  const result = await runProcess(CODEX_PATH, ['--version'], '', 5000);
  return result.ok;
}

async function codexChat(prompt: string): Promise<string> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'spark-codex-chat-'));
  const outputPath = path.join(tmpDir, 'last-message.txt');
  try {
    const result = await runProcess(CODEX_PATH, codexExecArgs(CODEX_MODEL, outputPath), prompt, 120000);
    if (!result.ok) {
      throw new Error(result.stderr || result.stdout || 'Codex CLI failed');
    }
    const output = readFileSync(outputPath, 'utf-8').trim();
    return output || "I'm here, but I couldn't generate a response right now.";
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

export const llm = {
  /**
   * Check if the configured LLM is available.
   */
  async isAvailable(): Promise<boolean> {
    if (isCodexProvider()) {
      return await codexAvailable();
    }

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
    const systemPrompt = buildSparkChatSystemPrompt(conversationHistory, memories);

    try {
      if (isCodexProvider()) {
        return await codexChat(`${systemPrompt}\n\nUser message:\n${userMessage}`);
      }

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
