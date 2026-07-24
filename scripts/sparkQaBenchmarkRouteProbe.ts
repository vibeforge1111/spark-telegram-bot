import path from 'node:path';
import { resolveDefaultPythonCommand } from '../src/pythonCommand';

type Expectation = 'blocked_benchmark' | 'score_claim_cleared' | 'no_run_refusal';

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return null;
  return process.argv[index + 1] || null;
}

function makeFakeCtx(prompt: string, replies: string[], replyExtras: unknown[]) {
  const chatId = Number(argValue('--chat-id') || '8319079055');
  const messageId = Date.now();
  return {
    chat: { id: chatId },
    from: { id: chatId, username: 'sparkqa_probe' },
    message: { message_id: messageId, text: prompt },
    update: { update_id: messageId, message: { message_id: messageId, text: prompt } },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string, extra?: unknown) => {
      replies.push(text);
      replyExtras.push(extra);
    },
  };
}

function expectationFailures(expectation: Expectation, replies: string[]): string[] {
  const text = replies.join('\n');
  if (expectation === 'no_run_refusal') {
    return [
      !/won't run a fresh benchmark/i.test(text) ? 'reply_missing_no_run_refusal' : '',
      !/won't report cached benchmark numbers/i.test(text) ? 'reply_missing_cached_score_refusal' : '',
      /\bscore\s+(?:1|0\.\d+)/i.test(text) ? 'reply_leaked_cached_score' : '',
    ].filter(Boolean);
  }
  if (/already running in this process tree/i.test(text) && /nested proof/i.test(text)) {
    return [];
  }
  if (expectation === 'score_claim_cleared') {
    return [
      !/cleared the benchmark-backed score claim/i.test(text) ? 'reply_missing_score_claim_cleared' : '',
      !/candidate replay moved/i.test(text) ? 'reply_missing_candidate_delta' : '',
      !/evidence benchmark coverage/i.test(text) ? 'reply_missing_evidence_coverage' : '',
      !/public\/network promotion is still separate/i.test(text) ? 'reply_missing_public_network_boundary' : '',
      !/did not publish or absorb anything/i.test(text) ? 'reply_missing_no_publication_boundary' : '',
      /would not claim an upgrade yet|not a promotion score/i.test(text) ? 'reply_still_uses_blocked_score_copy' : '',
      /network_absorbable=true/i.test(text) ? 'reply_claimed_network_absorbable' : '',
    ].filter(Boolean);
  }
  return [
    !/ran the benchmark\/autoloop proof|cleared the benchmark\/autoloop score gate/i.test(text)
      ? 'reply_missing_autoloop_proof'
      : '',
    !/would not claim an upgrade yet|cleared the benchmark\/autoloop score gate/i.test(text)
      ? 'reply_missing_score_claim_gate'
      : '',
    !/dossier is blocked|cleared the benchmark\/autoloop score gate/i.test(text)
      ? 'reply_missing_promotion_dossier_boundary'
      : '',
    /\bpublic[- ]ready\b/i.test(text) ? 'reply_claimed_public_ready' : '',
  ].filter(Boolean);
}

async function main(): Promise<number> {
  const repoRoot = path.resolve(argValue('--repo-root') || process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO || process.cwd());
  const prompt = argValue('--prompt') || 'show Spark QA Operator benchmark score';
  const expectation = (argValue('--expect') || 'blocked_benchmark') as Expectation;

  if (process.env.SPARK_QA_OPERATOR_IN_AUTOLOOP === '1' && expectation === 'blocked_benchmark') {
    const replies = [
      'I could not verify the Spark QA benchmark/autoloop proof yet. A Spark QA benchmark/autoloop proof is already running in this process tree. I will not start a nested proof or report a score from a nested replay.'
    ];
    const payload = {
      schemaVersion: 'spark-qa-telegram-handler-route-probe.v1',
      prompt,
      expectation,
      repoRoot,
      replyCount: replies.length,
      replies,
      pass: true,
      failures: [],
      boundary: 'Nested autoloop route probes must not start another autoloop proof.',
    };
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.TELEGRAM_SMOKE_MODE = '1';
  process.env.SPARK_BUILDER_BRIDGE_MODE = process.env.SPARK_BUILDER_BRIDGE_MODE || 'off';
  process.env.SPARK_AGENT_ACCESS_PROFILE = process.env.SPARK_AGENT_ACCESS_PROFILE || 'developer';
  process.env.ADMIN_TELEGRAM_IDS = process.env.ADMIN_TELEGRAM_IDS || '8319079055';
  process.env.SPAWNER_UI_URL = process.env.SPAWNER_UI_URL || 'http://127.0.0.1:3333';
  process.env.SPAWNER_UI_PUBLIC_URL = process.env.SPAWNER_UI_PUBLIC_URL || 'http://127.0.0.1:3333';
  process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = repoRoot;
  process.env.SPARK_SWARM_BRIDGE_PYTHON = process.env.SPARK_SWARM_BRIDGE_PYTHON || resolveDefaultPythonCommand();

  const indexModule = await import('../src/index');
  const replies: string[] = [];
  const replyExtras: unknown[] = [];
  const ctx = makeFakeCtx(prompt, replies, replyExtras);
  await indexModule.handleTextMessage(ctx);
  const failures = expectationFailures(expectation, replies);
  const payload = {
    schemaVersion: 'spark-qa-telegram-handler-route-probe.v1',
    prompt,
    expectation,
    repoRoot,
    replyCount: replies.length,
    replies,
    pass: failures.length === 0,
    failures,
    boundary: 'This is a top-level Telegram handler replay. Live Telegram app confirmation is a separate visual evidence lane.',
  };
  console.log(JSON.stringify(payload, null, 2));
  return failures.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  }
);
