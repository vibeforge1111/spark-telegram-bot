import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import axios from 'axios';
import { llm } from '../src/llm';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const originalPost = axios.post;
const originalEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OLLAMA_URL: process.env.OLLAMA_URL,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
  SPARK_AGENT_KNOWLEDGE_ENABLED: process.env.SPARK_AGENT_KNOWLEDGE_ENABLED,
  SPARK_CHAT_LLM_PROVIDER: process.env.SPARK_CHAT_LLM_PROVIDER,
};

function restore(): void {
  (axios as any).post = originalPost;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

async function run(): Promise<void> {
  await test('streams OpenAI-compatible chat completions into cumulative progress', async () => {
    const calls: Array<{ url: string; body: any; options: any }> = [];
    process.env.SPARK_AGENT_KNOWLEDGE_ENABLED = '0';
    process.env.SPARK_CHAT_LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_BASE_URL = 'http://llm.test/v1';
    process.env.OPENAI_MODEL = 'test-model';
    (axios as any).post = async (url: string, body: any, options: any) => {
      calls.push({ url, body, options });
      return {
        data: Readable.from([
          'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    };

    const progress: string[] = [];
    const response = await llm.chatStream('say hi', '', '', (text) => {
      progress.push(text);
    });

    assert.equal(response, 'Hello');
    assert.deepEqual(progress, ['Hel', 'Hello']);
    assert.equal(calls[0].url, 'http://llm.test/v1/chat/completions');
    assert.equal(calls[0].body.stream, true);
    assert.equal(calls[0].options.responseType, 'stream');
    restore();
  });

  await test('streams Ollama generate chunks into cumulative progress', async () => {
    const calls: Array<{ url: string; body: any; options: any }> = [];
    process.env.SPARK_AGENT_KNOWLEDGE_ENABLED = '0';
    process.env.SPARK_CHAT_LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_URL = 'http://ollama.test';
    process.env.OLLAMA_MODEL = 'local-model';
    (axios as any).post = async (url: string, body: any, options: any) => {
      calls.push({ url, body, options });
      return {
        data: Readable.from([
          '{"response":"Hel","done":false}\n',
          '{"response":"lo","done":false}\n',
          '{"done":true}\n',
        ]),
      };
    };

    const progress: string[] = [];
    const response = await llm.chatStream('say hi', '', '', (text) => {
      progress.push(text);
    });

    assert.equal(response, 'Hello');
    assert.deepEqual(progress, ['Hel', 'Hello']);
    assert.equal(calls[0].url, 'http://ollama.test/api/generate');
    assert.equal(calls[0].body.stream, true);
    assert.equal(calls[0].options.responseType, 'stream');
    restore();
  });
}

run().catch((error) => {
  restore();
  console.error(error);
  process.exit(1);
});
