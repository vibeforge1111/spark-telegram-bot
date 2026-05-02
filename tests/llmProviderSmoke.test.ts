import assert from 'node:assert/strict';
import axios from 'axios';
import { llm, pingChatProvider, resolveChatProviderConfig } from '../src/llm';

type CapturedRequest = {
  method: 'get' | 'post';
  url: string;
  body?: any;
  options?: any;
};

async function withMockedAxios<T>(
  handler: (request: CapturedRequest) => any,
  fn: () => Promise<T>
): Promise<T> {
  const originalGet = axios.get;
  const originalPost = axios.post;
  (axios as any).get = async (url: string, options?: any) => handler({ method: 'get', url, options });
  (axios as any).post = async (url: string, body?: any, options?: any) => handler({ method: 'post', url, body, options });
  try {
    return await fn();
  } finally {
    (axios as any).get = originalGet;
    (axios as any).post = originalPost;
  }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

async function main(): Promise<void> {
  await test('smokes Z.AI GLM chat completion health through OpenAI-compatible API', async () => {
    const previousProvider = process.env.SPARK_CHAT_LLM_PROVIDER;
    const previousKey = process.env.ZAI_API_KEY;
    delete process.env.SPARK_CHAT_LLM_MODEL;
    delete process.env.SPARK_CHAT_LLM_BASE_URL;
    process.env.SPARK_CHAT_LLM_PROVIDER = 'glm';
    process.env.ZAI_API_KEY = 'zai-smoke-key';

    const seen: CapturedRequest[] = [];
    try {
      const config = resolveChatProviderConfig();
      assert.equal(config.provider, 'zai');
      assert.equal(config.kind, 'openai_compat');
      assert.equal(config.model, 'glm-5.1');

      const result = await withMockedAxios((request) => {
        seen.push(request);
        assert.equal(request.method, 'post');
        assert.equal(request.url, 'https://api.z.ai/api/coding/paas/v4/chat/completions');
        assert.equal(request.options.headers.Authorization, 'Bearer zai-smoke-key');
        assert.equal(request.body.model, 'glm-5.1');
        return { data: { choices: [{ message: { content: 'CHAT_OK' } }] } };
      }, () => pingChatProvider(100));

      assert.equal(result.ok, true);
      assert.equal(result.detail, 'completion ok');
      assert.equal(seen.length, 1);
    } finally {
      if (previousProvider === undefined) delete process.env.SPARK_CHAT_LLM_PROVIDER;
      else process.env.SPARK_CHAT_LLM_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.ZAI_API_KEY;
      else process.env.ZAI_API_KEY = previousKey;
    }
  });

  await test('smokes MiniMax chat completion health through OpenAI-compatible API', async () => {
    const previousProvider = process.env.SPARK_CHAT_LLM_PROVIDER;
    const previousKey = process.env.MINIMAX_API_KEY;
    delete process.env.SPARK_CHAT_LLM_MODEL;
    delete process.env.SPARK_CHAT_LLM_BASE_URL;
    process.env.SPARK_CHAT_LLM_PROVIDER = 'minimax';
    process.env.MINIMAX_API_KEY = 'minimax-smoke-key';

    const seen: CapturedRequest[] = [];
    try {
      const config = resolveChatProviderConfig();
      assert.equal(config.provider, 'minimax');
      assert.equal(config.kind, 'openai_compat');
      assert.equal(config.model, 'MiniMax-M2.7');

      const result = await withMockedAxios((request) => {
        seen.push(request);
      assert.equal(request.method, 'post');
      assert.equal(request.url, 'https://api.minimax.io/v1/chat/completions');
      assert.equal(request.options.headers.Authorization, 'Bearer minimax-smoke-key');
      assert.equal(request.body.model, 'MiniMax-M2.7');
      assert.equal(request.body.max_tokens, 256);
      return { data: { choices: [{ message: { content: '<think>checking</thin>\nCHAT_OK' } }] } };
    }, () => pingChatProvider(100));

      assert.equal(result.ok, true);
      assert.equal(result.detail, 'completion ok');
      assert.equal(seen.length, 1);
    } finally {
      if (previousProvider === undefined) delete process.env.SPARK_CHAT_LLM_PROVIDER;
      else process.env.SPARK_CHAT_LLM_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.MINIMAX_API_KEY;
      else process.env.MINIMAX_API_KEY = previousKey;
    }
  });

  await test('smokes OpenAI-compatible availability check without falling through to Ollama', async () => {
    const previousProvider = process.env.SPARK_CHAT_LLM_PROVIDER;
    const previousKey = process.env.ZAI_API_KEY;
    process.env.SPARK_CHAT_LLM_PROVIDER = 'zai';
    process.env.ZAI_API_KEY = 'zai-smoke-key';

    try {
      const available = await withMockedAxios((request) => {
        assert.equal(request.method, 'get');
        assert.equal(request.url, 'https://api.z.ai/api/coding/paas/v4/models');
        assert.equal(request.options.headers.Authorization, 'Bearer zai-smoke-key');
        return { data: { data: [{ id: 'glm-5.1' }] } };
      }, () => llm.isAvailable());

      assert.equal(available, true);
    } finally {
      if (previousProvider === undefined) delete process.env.SPARK_CHAT_LLM_PROVIDER;
      else process.env.SPARK_CHAT_LLM_PROVIDER = previousProvider;
      if (previousKey === undefined) delete process.env.ZAI_API_KEY;
      else process.env.ZAI_API_KEY = previousKey;
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
