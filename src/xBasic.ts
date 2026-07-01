import { loadSparkAgentEnv } from './profileEnv';
import { redactText } from './redaction';

export type BasicXConfigStatus = 'configured' | 'missing';

export interface BasicXConfig {
  status: BasicXConfigStatus;
  tokenSource: 'SPARK_X_BEARER_TOKEN' | 'X_BEARER_TOKEN' | 'TWITTER_BEARER_TOKEN' | null;
  setupHint: string;
}

export interface BasicXPost {
  id: string;
  text: string;
  authorUsername?: string;
}

export interface BasicXFetchResult {
  ok: boolean;
  configured: boolean;
  posts: BasicXPost[];
  message: string;
}

export function loadSparkTelegramAgentEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const profile = env.SPARK_TELEGRAM_PROFILE?.trim();
  return [
    ...loadSparkAgentEnv('spark-telegram-bot', env),
    ...(profile ? loadSparkAgentEnv(`spark-telegram-bot.${profile}`, env) : [])
  ];
}

export function resolveBasicXConfig(env: NodeJS.ProcessEnv = process.env): BasicXConfig {
  loadSparkTelegramAgentEnv(env);
  const sources: Array<BasicXConfig['tokenSource']> = [
    'SPARK_X_BEARER_TOKEN',
    'X_BEARER_TOKEN',
    'TWITTER_BEARER_TOKEN'
  ];
  const tokenSource = sources.find((key) => key && env[key]?.trim()) || null;
  return {
    status: tokenSource ? 'configured' : 'missing',
    tokenSource,
    setupHint: 'Put SPARK_X_BEARER_TOKEN in ~/.spark/config/agents/spark-telegram-bot.env, then restart the Telegram agent.'
  };
}

export function extractXStatusIds(text: string): string[] {
  const ids: string[] = [];
  const pattern = /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/\s]+\/status\/(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!ids.includes(match[1])) ids.push(match[1]);
  }
  return ids;
}

export function shouldUseBasicXFetch(text: string): boolean {
  if (extractXStatusIds(text).length === 0) return false;
  return /\b(?:read|fetch|pull|open|show|review|judge|score|evaluate|analy[sz]e|check|thoughts?|updates?|posts?|shared)\b/i.test(text);
}

export async function fetchBasicXPosts(
  ids: string[],
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<BasicXFetchResult> {
  const config = resolveBasicXConfig(env);
  if (config.status !== 'configured' || !config.tokenSource) {
    return {
      ok: false,
      configured: false,
      posts: [],
      message: config.setupHint
    };
  }

  const token = env[config.tokenSource]?.trim() || '';
  const url = new URL('https://api.x.com/2/tweets');
  url.searchParams.set('ids', ids.join(','));
  url.searchParams.set('tweet.fields', 'author_id,created_at');
  url.searchParams.set('expansions', 'author_id');
  url.searchParams.set('user.fields', 'username');

  try {
    const response = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        posts: [],
        message: `X basic fetch failed with HTTP ${response.status}. Check the Spark agent X token and X API access level.`
      };
    }
    const payload = await response.json() as any;
    const users = new Map<string, string>();
    for (const user of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
      if (user?.id && user?.username) users.set(String(user.id), String(user.username));
    }
    const posts = (Array.isArray(payload?.data) ? payload.data : [])
      .map((item: any) => ({
        id: String(item?.id || ''),
        text: String(item?.text || '').trim(),
        authorUsername: item?.author_id ? users.get(String(item.author_id)) : undefined
      }))
      .filter((post: BasicXPost) => post.id && post.text);
    return {
      ok: posts.length > 0,
      configured: true,
      posts,
      message: posts.length > 0 ? 'Fetched X posts through Spark basic X API.' : 'X returned no readable post text for those ids.'
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      configured: true,
      posts: [],
      message: `X basic fetch failed: ${redactText(detail)}`
    };
  }
}

export function renderBasicXConfigReply(config: BasicXConfig = resolveBasicXConfig()): string {
  if (config.status === 'configured') {
    return 'Spark has a basic X API key configured for this Telegram agent. I can use that for simple X post reads; XContent is still the premium scoring and optimization lane.';
  }
  return [
    'Spark can support basic X reads without XContent, but this Telegram agent needs its own X bearer token first.',
    config.setupHint,
    'XContent should stay premium for deeper content scoring, variants, and strategy.'
  ].join('\n\n');
}

export function renderBasicXPostsForReview(posts: BasicXPost[]): string {
  const lines = ['I fetched the X post text through Spark basic X API.'];
  for (const post of posts.slice(0, 5)) {
    const author = post.authorUsername ? `@${post.authorUsername}` : `post ${post.id}`;
    lines.push('', `${author}: ${post.text}`);
  }
  lines.push('', 'Send "score these" if you want the Spark confidence / stress / defensiveness read next.');
  return lines.join('\n');
}

export function renderBasicXUnavailableReply(message: string): string {
  return [
    'I can do basic X reads from Spark-owned agent env, but I cannot use XContent secrets as a fallback.',
    message,
    'For now, paste the post text or screenshots and I can review them from the visible content.'
  ].join('\n\n');
}
