import axios from 'axios';
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderSparkErrorReply } from './errorExplain';
import { spawnHidden } from './hiddenProcess';
import { chatCommandTimeoutMs } from './timeoutConfig';

loadEnv({ path: path.join(os.homedir(), '.env.zai'), override: false, quiet: true });

const CODEX_MODEL = process.env.CODEX_MODEL || process.env.SPARK_CODEX_MODEL || 'gpt-5.5';
const CODEX_PATH = process.env.CODEX_PATH || process.env.SPARK_CODEX_PATH || 'codex';
const CLAUDE_PATH = process.env.CLAUDE_PATH || process.env.SPARK_CLAUDE_PATH || 'claude';
const DEFAULT_AGENT_KNOWLEDGE_DIR = path.resolve(process.cwd(), 'agent-knowledge');
const MAX_AGENT_KNOWLEDGE_CHARS = 18_000;

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

export interface BuildClarificationMicrocopyInput {
  projectName: string;
  questions: string[];
  assumptions: string[];
}

export interface BuildClarificationMicrocopy {
  recommendation: string;
  steeringQuestion: string;
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

export interface ChatProviderPing {
  ok: boolean;
  detail: string;
}

interface ChatProviderConfig {
  provider: string;
  kind: 'codex' | 'claude' | 'openai_compat' | 'ollama' | 'unsupported' | 'not_configured';
  model: string;
  baseUrl: string;
  apiKey?: string;
}

const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const HUGGINGFACE_DEFAULT_BASE_URL = 'https://router.huggingface.co/v1';
const KIMI_DEFAULT_BASE_URL = 'https://api.moonshot.ai/v1';
const ZAI_DEFAULT_BASE_URL = 'https://api.z.ai/api/coding/paas/v4/';
const MINIMAX_DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
const OLLAMA_DEFAULT_MODEL = 'llama3.2:3b';
const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234/v1';
const LMSTUDIO_DEFAULT_MODEL = 'local-model';
const HUGGINGFACE_DEFAULT_MODEL = 'google/gemma-4-26B-A4B-it:fastest';

function firstEnv(env: NodeJS.ProcessEnv, ...keys: string[]): string {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function normalizeProvider(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'glm' || normalized === 'z.ai') return 'zai';
  if (normalized === 'claude') return 'anthropic';
  if (normalized === 'open-router') return 'openrouter';
  if (normalized === 'hf' || normalized === 'hugging-face') return 'huggingface';
  if (normalized === 'lm-studio' || normalized === 'lm studio') return 'lmstudio';
  if (normalized === 'moonshot' || normalized === 'kimi-k2') return 'kimi';
  return normalized;
}

export function resolveChatProviderConfig(env: NodeJS.ProcessEnv = process.env): ChatProviderConfig {
  const roleProvider = normalizeProvider(firstEnv(env, 'SPARK_CHAT_LLM_PROVIDER', 'LLM_PROVIDER', 'SPARK_LLM_PROVIDER'));
  const botProvider = normalizeProvider(firstEnv(env, 'SPARK_CHAT_LLM_BOT_PROVIDER', 'BOT_DEFAULT_PROVIDER', 'SPARK_BOT_DEFAULT_PROVIDER'));

  let provider = roleProvider || botProvider;
  if (roleProvider === 'openai') {
    const openaiBase = firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'OPENAI_BASE_URL');
    const openaiUsesCustomBase = Boolean(openaiBase && openaiBase.replace(/\/+$/, '') !== OPENAI_DEFAULT_BASE_URL);
    provider = (env.OPENAI_API_KEY || openaiUsesCustomBase) ? 'openai' : (botProvider || 'openai');
  } else if (!provider && env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER === '1') {
    if (env.ZAI_API_KEY) provider = 'zai';
    else if (env.MINIMAX_API_KEY) provider = 'minimax';
    else if (env.OPENROUTER_API_KEY) provider = 'openrouter';
    else if (env.HF_TOKEN || env.HUGGINGFACE_API_KEY) provider = 'huggingface';
    else if (env.KIMI_API_KEY || env.MOONSHOT_API_KEY) provider = 'kimi';
    else if (env.OLLAMA_URL || env.OLLAMA_MODEL) provider = 'ollama';
  }

  if (provider === 'codex') {
    return {
      provider,
      kind: 'codex',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'CODEX_MODEL', 'SPARK_CODEX_MODEL') || 'gpt-5.5',
      baseUrl: '',
    };
  }
  if (provider === 'anthropic') {
    return {
      provider,
      kind: 'claude',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'ANTHROPIC_MODEL', 'CLAUDE_MODEL') || 'claude-sonnet-4-6',
      baseUrl: '',
    };
  }
  if (provider === 'zai') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'ZAI_MODEL') || 'glm-5.1',
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'ZAI_BASE_URL') || ZAI_DEFAULT_BASE_URL,
      apiKey: env.ZAI_API_KEY,
    };
  }
  if (provider === 'openai') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'OPENAI_MODEL') || 'gpt-5.5',
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'OPENAI_BASE_URL') || OPENAI_DEFAULT_BASE_URL,
      apiKey: env.OPENAI_API_KEY,
    };
  }
  if (provider === 'openrouter') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'OPENROUTER_MODEL') || 'openai/gpt-5.5',
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'OPENROUTER_BASE_URL') || OPENROUTER_DEFAULT_BASE_URL,
      apiKey: env.OPENROUTER_API_KEY,
    };
  }
  if (provider === 'kimi') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'KIMI_MODEL') || 'kimi-k2.6',
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'KIMI_BASE_URL', 'MOONSHOT_BASE_URL') || KIMI_DEFAULT_BASE_URL,
      apiKey: env.KIMI_API_KEY || env.MOONSHOT_API_KEY,
    };
  }
  if (provider === 'lmstudio') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'LMSTUDIO_MODEL') || LMSTUDIO_DEFAULT_MODEL,
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'LMSTUDIO_BASE_URL') || LMSTUDIO_DEFAULT_BASE_URL,
      apiKey: env.LMSTUDIO_API_KEY || 'lm-studio',
    };
  }
  if (provider === 'huggingface') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'HUGGINGFACE_MODEL') || HUGGINGFACE_DEFAULT_MODEL,
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'HUGGINGFACE_BASE_URL') || HUGGINGFACE_DEFAULT_BASE_URL,
      apiKey: env.HF_TOKEN || env.HUGGINGFACE_API_KEY,
    };
  }
  if (provider === 'minimax') {
    return {
      provider,
      kind: 'openai_compat',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'MINIMAX_MODEL') || 'MiniMax-M2.7',
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'MINIMAX_BASE_URL') || MINIMAX_DEFAULT_BASE_URL,
      apiKey: env.MINIMAX_API_KEY,
    };
  }
  if (provider === 'ollama') {
    return {
      provider,
      kind: 'ollama',
      model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL', 'OLLAMA_MODEL') || OLLAMA_DEFAULT_MODEL,
      baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL', 'OLLAMA_URL') || OLLAMA_DEFAULT_BASE_URL,
    };
  }
  if (!provider) {
    return { provider: 'not_configured', kind: 'not_configured', model: '', baseUrl: '' };
  }
  return {
    provider,
    kind: 'unsupported',
    model: firstEnv(env, 'SPARK_CHAT_LLM_MODEL') || '',
    baseUrl: firstEnv(env, 'SPARK_CHAT_LLM_BASE_URL') || '',
  };
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
- /access <1|2|3|4>: choose Spark's access level for this Telegram chat. Level 1 is chat only, Level 2 is Builder and explicit missions, Level 3 adds public web/GitHub research, Level 4 adds local workspace build access.

When the user asks what Spark knows or can do, explain these capabilities plainly and briefly. Do not pretend a tool succeeded unless it actually did.
Spark does have a Telegram chat access-level system. Never say there is no access level, tier, permission system, or permission surface when the user is asking about Spark access. If they ask to see it, say they can ask "what is my access level?" If they ask to change it, say they can ask "change my access level to 3" or use /access 3. If a task is blocked, name the minimum access level that would unlock it.
When the user asks you to inspect a public GitHub repo, URL, or local Spark surface, do not claim you have no access as a blanket statement. Explain the truthful boundary: plain chat cannot browse by itself, but Spark can use Spawner/Codex missions for public repo/web inspection when this chat is at Access Level 3 or 4. If access is not enabled, tell the user to run /access 3 or /access 4.
The Telegram gateway can start missions from explicit natural-language requests or /run. Never say you started, launched, kicked off, created, queued, or are running a Spawner mission unless the gateway returns a mission id or explicit acknowledgement. If no mission id or gateway acknowledgement is present, offer to shape the request or ask the user to confirm the mission goal.`;

export function loadSparkAgentKnowledgeBase(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SPARK_AGENT_KNOWLEDGE_ENABLED === '0') return '';
  const root = env.SPARK_AGENT_KNOWLEDGE_DIR?.trim() || DEFAULT_AGENT_KNOWLEDGE_DIR;
  if (!existsSync(root)) return '';
  const chunks: string[] = [];
  for (const name of readdirSync(root).filter((file) => file.toLowerCase().endsWith('.md')).sort()) {
    if (name.startsWith('.')) continue;
    const filePath = path.join(root, name);
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) continue;
    chunks.push(`### ${name}\n${content}`);
  }
  const joined = chunks.join('\n\n').slice(0, MAX_AGENT_KNOWLEDGE_CHARS).trim();
  return joined;
}

export function buildSparkChatSystemPrompt(conversationHistory: string = '', memories: string = ''): string {
  const agentKnowledge = loadSparkAgentKnowledgeBase();
  return `You are Spark, the user's personal operator and thinking partner. Not a generic assistant.
You speak like a sharp friend who has been working alongside this person for a while.
Lead with the answer, the call, or the next move in the first sentence. No hedges, no throat clearing, no restating the question.
Be warm but high-signal. No filler, no performative enthusiasm, no canned check-ins like "How can I help today?".
Continue the conversation from the user's actual message and prior context. Do not reset to a greeting.
When the user refers to a numbered or listed option, like "no.2", "option 2", "#2", "the second one", or "that one", resolve it against the most recent list in the conversation before using older memory. Restate the resolved option briefly. If the local list is missing, ask one clarifying question instead of guessing.
Recent chat context outranks older memory for local references. Memory must not override what "this", "that", "it", or a numbered option means in the current conversation.
When the user is discussing existing Spawner UI, Kanban, Canvas, Mission Control, relay state, or task execution, assume those surfaces already exist in spawner-ui. Do not suggest a standalone app or ask whether it should be standalone unless the user explicitly asks for a separate tool.
Reply briefly by default. Match length to what the question actually needs.
Write for Telegram scanning: short paragraphs, usually one or two sentences each. Break dense answers into small chunks.
Avoid Markdown bold/italic emphasis. Use plain headings or simple numbered points when structure helps.
Never use em dashes (-). Use a hyphen, a comma, a period, or a colon instead.
Use Spark module names only when the user asks what Spark can do, asks about setup, or needs troubleshooting. Otherwise keep subsystem details out of normal chat.
If something internal failed, speak as the agent: say what you cannot do right now and what the user can try.
Do not offer to scaffold, start, run, or create a mission at the end of an ideation answer unless the user explicitly asks to build, run, scaffold, start, or create it.

${SPARK_SYSTEM_PRIMER}
${agentKnowledge ? `## Spark agent knowledge base\nUse this as background knowledge for natural conversation. Do not quote it as a canned panel. Prefer a brief, contextual answer that fits the user's current message.\n\n${agentKnowledge}` : ''}
${memories ? `## What I remember\n${memories}` : ''}
${conversationHistory ? `## Where we left off\n${conversationHistory}` : ''}

Keep responses brief (1-3 sentences) unless the user asks for detail. If you need more, keep paragraphs short and skimmable.`;
}

function runProcess(command: string, args: string[], input: string, timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawnHidden(command, args, {
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

export async function pingChatProvider(timeoutMs: number = 12000): Promise<ChatProviderPing> {
  const config = resolveChatProviderConfig();
  if (config.kind === 'codex') {
    return (await codexAvailable())
      ? { ok: true, detail: 'codex cli available' }
      : { ok: false, detail: 'codex cli unavailable' };
  }
  if (config.kind === 'claude') {
    const result = await runProcess(CLAUDE_PATH, ['--version'], '', 5000);
    return result.ok
      ? { ok: true, detail: 'claude cli available' }
      : { ok: false, detail: 'claude cli unavailable' };
  }

  if (config.kind === 'openai_compat') {
    try {
      const res = await axios.post<ZaiChatResponse>(
        joinUrl(config.baseUrl, '/chat/completions'),
        {
          model: config.model,
          messages: [
            { role: 'system', content: 'Health check. Reply with exactly CHAT_OK.' },
            { role: 'user', content: 'Reply with exactly: CHAT_OK' }
          ],
          temperature: 0,
          max_tokens: 8,
          thinking: { type: 'disabled' }
        },
        {
          timeout: timeoutMs,
          headers: {
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
            'Content-Type': 'application/json'
          }
        }
      );
      const content = res.data.choices?.[0]?.message?.content?.trim() ||
        res.data.choices?.[0]?.message?.reasoning_content?.trim() ||
        '';
      return /CHAT_OK/i.test(content)
        ? { ok: true, detail: 'completion ok' }
        : { ok: false, detail: 'unexpected completion' };
    } catch (err: any) {
      return { ok: false, detail: err.response?.data?.error?.message || err.code || err.message || 'request failed' };
    }
  }

  if (config.kind === 'not_configured') {
    return { ok: false, detail: 'chat provider is not configured' };
  }

  if (config.kind === 'unsupported') {
    return { ok: false, detail: `chat provider ${config.provider} is not supported by the local fallback path` };
  }

  try {
    const res = await axios.post<OllamaResponse>(
      `${config.baseUrl.replace(/\/+$/, '')}/api/generate`,
      {
        model: config.model,
        prompt: 'Reply with exactly: CHAT_OK',
        system: 'Health check. Reply with exactly CHAT_OK.',
        stream: false,
        options: {
          temperature: 0,
          num_predict: 8,
        },
      },
      { timeout: timeoutMs }
    );
    return /CHAT_OK/i.test(res.data.response || '')
      ? { ok: true, detail: 'completion ok' }
      : { ok: false, detail: 'unexpected completion' };
  } catch (err: any) {
    return { ok: false, detail: err.code || err.message || 'request failed' };
  }
}

async function codexChat(prompt: string): Promise<string> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'spark-codex-chat-'));
  const outputPath = path.join(tmpDir, 'last-message.txt');
  try {
    const result = await runProcess(CODEX_PATH, codexExecArgs(CODEX_MODEL, outputPath), prompt, chatCommandTimeoutMs());
    if (!result.ok) {
      throw new Error(result.stderr || result.stdout || 'Codex CLI failed');
    }
    const output = readFileSync(outputPath, 'utf-8').trim();
    return output || "I'm here, but I couldn't generate a response right now.";
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function claudeChat(prompt: string, model: string): Promise<string> {
  const result = await runProcess(
    CLAUDE_PATH,
    ['-p', '--output-format', 'text', '--model', model],
    prompt,
    chatCommandTimeoutMs()
  );
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || 'Claude CLI failed');
  }
  return result.stdout.trim() || "I'm here, but I couldn't generate a response right now.";
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1).trim();
  if (!candidate || !candidate.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizeMicrocopy(parsed: Record<string, unknown>): BuildClarificationMicrocopy | null {
  const recommendation = typeof parsed.recommendation === 'string'
    ? parsed.recommendation.replace(/\s+/g, ' ').trim()
    : '';
  const steeringQuestion = typeof parsed.steeringQuestion === 'string'
    ? parsed.steeringQuestion.replace(/\s+/g, ' ').trim()
    : '';
  if (recommendation.length < 12 || recommendation.length > 150) return null;
  if (steeringQuestion.length < 10 || steeringQuestion.length > 160) return null;
  return {
    recommendation: recommendation.replace(/[.!?]+$/, ''),
    steeringQuestion: steeringQuestion.replace(/[.!?]+$/, '?')
  };
}

export function buildClarificationMicrocopyPrompt(input: BuildClarificationMicrocopyInput): string {
  return [
    'You write tiny Telegram UX copy for Spark build scoping.',
    'Return strict JSON only, no markdown.',
    'Schema: {"recommendation":"<short recommended default>","steeringQuestion":"<one optional steering question>"}',
    '',
    'Rules:',
    '- Keep recommendation under 18 words.',
    '- Keep steeringQuestion under 18 words.',
    '- Make the default concrete and project-specific.',
    '- Do not mention accounts/login unless the project needs it.',
    '- Do not tell the user to say go. The wrapper handles that.',
    '- No emoji. No lists. No filler.',
    '',
    `Project: ${input.projectName}`,
    `Planner questions: ${input.questions.slice(0, 4).join(' | ') || 'none'}`,
    `Planner assumptions: ${input.assumptions.slice(0, 4).join(' | ') || 'none'}`
  ].join('\n');
}

export async function generateBuildClarificationMicrocopy(
  input: BuildClarificationMicrocopyInput,
  timeoutMs: number = Number(process.env.SPARK_CLARIFICATION_COPY_TIMEOUT_MS || 8000)
): Promise<BuildClarificationMicrocopy | null> {
  if (process.env.SPARK_CLARIFICATION_COPY_LLM === '0') return null;
  const prompt = buildClarificationMicrocopyPrompt(input);
  try {
    const config = resolveChatProviderConfig();
    let raw = '';
    if (config.kind === 'codex') {
      raw = await codexChat(prompt);
    } else if (config.kind === 'claude') {
      raw = await claudeChat(prompt, config.model);
    } else if (config.kind === 'openai_compat') {
      const res = await axios.post<ZaiChatResponse>(
        joinUrl(config.baseUrl, '/chat/completions'),
        {
          model: config.model,
          messages: [
            { role: 'system', content: 'Return strict JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.8,
          max_tokens: 120,
          thinking: { type: 'disabled' }
        },
        {
          timeout: timeoutMs,
          headers: {
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
            'Content-Type': 'application/json'
          }
        }
      );
      raw = res.data.choices?.[0]?.message?.content?.trim() ||
        res.data.choices?.[0]?.message?.reasoning_content?.trim() ||
        '';
    } else if (config.kind === 'ollama') {
      const res = await axios.post<OllamaResponse>(
        `${config.baseUrl.replace(/\/+$/, '')}/api/generate`,
        {
          model: config.model,
          prompt,
          system: 'Return strict JSON only.',
          stream: false,
          options: { temperature: 0.8, num_predict: 120 },
        },
        { timeout: timeoutMs }
      );
      raw = res.data.response?.trim() || '';
    } else {
      return null;
    }
    const parsed = extractJsonObject(raw);
    return parsed ? normalizeMicrocopy(parsed) : null;
  } catch (err: any) {
    console.warn('Clarification microcopy LLM failed:', err?.code || err?.message || String(err));
    return null;
  }
}

export const llm = {
  /**
   * Check if the configured LLM is available.
   */
  async isAvailable(): Promise<boolean> {
    const config = resolveChatProviderConfig();
    if (config.kind === 'codex') {
      return await codexAvailable();
    }
    if (config.kind === 'claude') {
      const result = await runProcess(CLAUDE_PATH, ['--version'], '', 5000);
      return result.ok;
    }

    if (config.kind === 'openai_compat') {
      try {
        const res = await axios.get(joinUrl(config.baseUrl, '/models'), {
          timeout: 5000,
          headers: {
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
          }
        });
        return Array.isArray(res.data?.data) || Array.isArray(res.data?.models);
      } catch {
        return false;
      }
    }

    if (config.kind === 'not_configured' || config.kind === 'unsupported') {
      return false;
    }

    try {
      const res = await axios.get(`${config.baseUrl.replace(/\/+$/, '')}/api/tags`, { timeout: 2000 });
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
      const config = resolveChatProviderConfig();
      if (config.kind === 'codex') {
        return await codexChat(`${systemPrompt}\n\nUser message:\n${userMessage}`);
      }
      if (config.kind === 'claude') {
        return await claudeChat(`${systemPrompt}\n\nUser message:\n${userMessage}`, config.model);
      }

      if (config.kind === 'openai_compat') {
        const res = await axios.post<ZaiChatResponse>(
          joinUrl(config.baseUrl, '/chat/completions'),
          {
            model: config.model,
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
              ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
              'Content-Type': 'application/json'
            }
          }
        );

        const content = res.data.choices?.[0]?.message?.content?.trim();
        const reasoningContent = res.data.choices?.[0]?.message?.reasoning_content?.trim();
        return content || reasoningContent || "I'm here, but I couldn't generate a response right now.";
      }

      if (config.kind === 'not_configured') {
        throw new Error('Spark chat provider is not configured. Run spark setup to choose chat, builder, memory, and mission providers.');
      }
      if (config.kind === 'unsupported') {
        throw new Error(`Spark chat provider ${config.provider} is not supported by the local fallback path. Run /diagnose or route chat through Builder.`);
      }

      const res = await axios.post<OllamaResponse>(
        `${config.baseUrl.replace(/\/+$/, '')}/api/generate`,
        {
          model: config.model,
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
    } catch (err: any) {
      console.error('LLM error:', {
        provider: resolveChatProviderConfig().provider,
        code: err?.code,
        status: err?.response?.status,
        message: err?.response?.data?.error || err?.message || String(err)
      });
      return renderSparkErrorReply(err, 'chat', true);
    }
  },
};
