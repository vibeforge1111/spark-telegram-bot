import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  formatConversationColdMemoryContext,
  formatDiagnosticsScanReply,
  formatRouteProbeReply,
  formatSelfAwarenessReply
} from '../src/builderBridge';
import {
  buildMemoryBridgeUnavailableReply,
  renderChatRuntimeFailureReply
} from '../src/conversationIntent';
import { renderSparkErrorReply } from '../src/errorExplain';
import { buildSparkChatSystemPrompt } from '../src/llm';
import { renderModelRecommendations, renderModelStatus } from '../src/modelSwitch';
import { sanitizeAndSplitTelegramText, sanitizeOutbound } from '../src/outboundSanitize';
import {
  formatBuildClarificationReplyWithMicrocopy,
  formatCanvasShapingHeartbeatSummary,
  formatCanvasStillRunningSummary
} from '../src/index';
import {
  renderSparkAccessBriefStatus,
  renderSparkAccessChangeConfirmation,
  renderSparkAccessDenial,
  renderSparkAccessRuntimeHint
} from '../src/accessPolicy';
import { lintTelegramConversationStyle, lintTelegramReplySafety } from './conversationStyleLint';
import { launchConversationGoldenReplies } from './fixtures/launchConversationGoldenReplies';

function assertTelegramParagraphSpacing(text: string): void {
  assert.deepEqual(lintTelegramConversationStyle(text, { maxParagraphWords: 34 }), []);
}

function issueCodes(text: string): Set<string> {
  return new Set(lintTelegramConversationStyle(text).map((issue) => issue.code));
}

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('launch prompt keeps conversation style bounded away from memory authority', () => {
  const prompt = buildSparkChatSystemPrompt(
    'Recent list: 1. memory timeline 2. recall audit board',
    'Older memory says the user likes architecture summaries.'
  );

  assert.match(prompt, /Not a generic assistant/);
  assert.match(prompt, /Lead with the answer/);
  assert.match(prompt, /Reply briefly by default/);
  assert.match(prompt, /Read the room/);
  assert.match(prompt, /corrects your tone, format, or answer/);
  assert.match(prompt, /most recent list/);
  assert.match(prompt, /Memory must not override/);
  assert.match(prompt, /Style hints are turn guidance, not durable memory/);
  assert.match(prompt, /Use Spark module names only when the user asks/);
  assert.match(prompt, /Do not offer to scaffold/);
});

test('repo carries the Telegram composition standard as mergeable product guidance', () => {
  const standard = readFileSync(path.join(__dirname, '..', 'docs', 'TELEGRAM_COMPOSITION_STANDARD.md'), 'utf8');

  assert.match(standard, /Telegram should answer only four things/);
  assert.match(standard, /What happened\?/);
  assert.match(standard, /Use dotted bullets/);
  assert.match(standard, /Do not combine icons with bullets/);
  assert.match(standard, /Put raw evidence behind Workspace, Decisions, Canvas, Board, logs, or trace links/);
  assert.match(standard, /Does it sound like Spark helping a person/);
  assert.match(standard, /Status: clean/);
  assert.match(standard, /Check: clean/);
  assert.match(standard, /rich-message rendering/);
});

test('streaming design preserves the measured rich-message proof shape', () => {
  const design = readFileSync(path.join(__dirname, '..', 'docs', 'LIVE_CHAT_STREAMING_DESIGN.md'), 'utf8');

  assert.match(design, /rich-message-delivery-proof/);
  assert.match(design, /cp-streaming-002/);
  assert.match(design, /Status: clean/);
  assert.match(design, /rejected here/);
  assert.match(design, /Check: clean/);
  assert.match(design, /Token: ok/);
  assert.match(design, /one final Telegram message/);
});

test('repo carries a readability ergonomics and vibe rubric', () => {
  const standard = readFileSync(path.join(__dirname, '..', 'docs', 'TELEGRAM_COMPOSITION_STANDARD.md'), 'utf8');

  assert.match(standard, /## Composition Rubric/);
  assert.match(standard, /### Readability/);
  assert.match(standard, /### Ergonomics/);
  assert.match(standard, /### Vibe/);
  assert.match(standard, /five seconds/);
  assert.match(standard, /one useful next move/);
  assert.match(standard, /capable teammate/);
  assert.match(standard, /at least 2/);
});

test('system prompt includes the Telegram composition standard for dense replies', () => {
  const prompt = buildSparkChatSystemPrompt('', '');

  assert.match(prompt, /answer four things only/);
  assert.match(prompt, /Use one clear headline/);
  assert.match(prompt, /dotted bullets/);
  assert.match(prompt, /Do not combine icons with bullets or numbering/);
  assert.match(prompt, /Prefer one useful next move/);
});

test('launch cold memory context remains supporting, filtered, and bounded', () => {
  const formatted = formatConversationColdMemoryContext({
    context_packet: {
      sections: [
        {
          section: 'recent_conversation',
          items: [
            {
              lane: 'recent_conversation',
              source_class: 'recent_conversation',
              predicate: 'conversation.focus',
              text: 'The user picked option 2 from the current planning list.'
            },
            {
              lane: 'recent_conversation',
              source_class: 'recent_conversation',
              predicate: 'raw_turn',
              text: 'Spark could not reach the Builder memory path right now. Reason: Command failed: python -m spark_intelligence.cli'
            }
          ]
        },
        {
          section: 'compiled_project_knowledge',
          items: [
            {
              lane: 'wiki_packets',
              source_class: 'obsidian_llm_wiki_packets',
              predicate: 'knowledge.packet',
              text: 'Spark Diagnostic Report with stale route failures.'
            }
          ]
        }
      ]
    }
  }, 900);

  assert.equal(formatted.sourceCount, 1);
  assert.match(formatted.contextText, /\[Spark Cold Memory Context\]/);
  assert.match(formatted.contextText, /supporting retrieved memory only/);
  assert.match(formatted.contextText, /option 2 from the current planning list/);
  assert.doesNotMatch(formatted.contextText, /Command failed|Diagnostic Report|wiki_packets/);
  assert.equal(formatted.contextText.length <= 1000, true);
});

test('launch outbound cleanup keeps Telegram replies readable and non-leaky', () => {
  const cleaned = sanitizeOutbound(
    '**Answer** \u2014 this route is ready. token=sk-live-secret-value-that-should-not-leak'
  );

  assert.doesNotMatch(cleaned, /\*\*Answer\*\*|\u2014|sk-live-secret-value-that-should-not-leak/);
  assert.match(cleaned, /Answer - this route is ready/);
  assert.match(cleaned, /\*\*\*/);
});

test('launch long replies are split only after sanitization', () => {
  const chunks = sanitizeAndSplitTelegramText(
    Array.from({ length: 24 }, (_, index) => `**Point ${index + 1}** \u2014 ${'conversation detail '.repeat(14)}`).join('\n\n'),
    700
  );

  assert.equal(chunks.length > 1, true);
  assert.ok(chunks.every((chunk) => chunk.length <= 700));
  assert.ok(chunks.every((chunk) => !/(\*\*|\u2014)/.test(chunk)));
});

test('launch setup guidance uses readable Telegram paragraph spacing', () => {
  const kokoroInstall =
    'Nice, Kokoro is already installed for this Spark. The local voice files are connected too.\n\n' +
    'You can test it with `/voice onboard local`.';
  const localVoiceReady =
    'Nice, local voice is ready: faster-whisper for listening, Kokoro for replies.\n\n' +
    'Ask me for one short voice reply, then send a quick Telegram voice note.';

  assertTelegramParagraphSpacing(kokoroInstall);
  assertTelegramParagraphSpacing(localVoiceReady);
  assert.doesNotMatch(kokoroInstall, /connected too\.\nYou can test/);
  assert.doesNotMatch(localVoiceReady, /for replies\.\nAsk me/);
});

test('launch golden replies pass the report-only conversation style lint', () => {
  for (const golden of launchConversationGoldenReplies) {
    assert.deepEqual(
      lintTelegramConversationStyle(golden.text),
      [],
      `${golden.name} should stay clean for ${golden.surface}`
    );
  }
});

test('launch conversation style lint catches common drift shapes', () => {
  const cramped = issueCodes('Memory is ready.\nTry `/recall launch` now.');
  assert.equal(cramped.has('single_newline_paragraph_join'), true);

  const leaky = issueCodes(
    '**Route report** \u2014 context_packet failed with command failed: python -m spark_intelligence.cli token=sk-live-secret'
  );
  assert.equal(leaky.has('markdown_bold'), true);
  assert.equal(leaky.has('dash_family'), true);
  assert.equal(leaky.has('internal_jargon'), true);
  assert.equal(leaky.has('secret_like_text'), true);

  const planDump = issueCodes('Implementation plan:\n\nStep 1: rewrite the prompt.\n\nStep 2: change memory routing.');
  assert.equal(planDump.has('plan_dump'), true);

  const wallOfText = issueCodes(
    'This is a single Telegram paragraph with too many words because it tries to explain status, evidence, caveats, next action, route behavior, memory behavior, provider behavior, repair instructions, operator context, confidence level, previous failures, and future follow-up all at once.'
  );
  assert.equal(wallOfText.has('paragraph_too_long'), true);

  const chatbox = issueCodes(
    'Certainly! Here is a helpful response. How may I assist you today?'
  );
  assert.equal(chatbox.has('generic_chatbox_voice'), true);

  const doubleMarked = issueCodes('- ✅ Spark Live is ready.');
  assert.equal(doubleMarked.has('double_marker'), true);

  const numberedIcon = issueCodes('✅ 1. latest run improved');
  assert.equal(numberedIcon.has('double_marker'), true);

  const emojiSpam = issueCodes('🛠️ Starting.\n\n✨ Ready.\n\n⚠️ Check.\n\n✅ Done.');
  assert.equal(emojiSpam.has('emoji_spam'), true);

  const reportCard = issueCodes('Provider\n• Codex\n\nMission\n• Token Launch Dashboard\n\nMove\n• Open the board');
  assert.equal(reportCard.has('report_card_voice'), true);
  const colonReportCard = issueCodes('Provider:\n• Codex\n\nMission:\n• Token Launch Dashboard\n\nMove:\n• Open the board');
  assert.equal(colonReportCard.has('report_card_voice'), true);

  const rawReason = issueCodes('Blocked by route_not_selected_by_turn_envelope from harness_core:owner_mismatch.');
  assert.equal(rawReason.has('raw_reason_code'), true);
});

test('launch natural work replies pass the readability ergonomics vibe bar', () => {
  const clarification = formatBuildClarificationReplyWithMicrocopy(
    'Paragraph Spacing Smoke Page',
    ['Should it compare spacing presets side by side or adjust one paragraph stack live?'],
    ['Assume it should be a tiny one-screen tool with one slider.'],
    {
      recommendation: 'Build a single responsive page to tune paragraph spacing with sample text and saved presets.',
      steeringQuestion: 'Should it compare spacing presets side by side or adjust one paragraph stack live?'
    }
  );
  const heartbeat = formatCanvasShapingHeartbeatSummary({
    projectName: 'Paragraph Spacing Smoke Page',
    elapsedSeconds: 120
  });
  const stillRunning = formatCanvasStillRunningSummary({
    projectName: 'Paragraph Spacing Smoke Page',
    elapsedSeconds: 180,
    kanbanUrl: 'http://127.0.0.1:3333/kanban?mission=mission-rubric'
  });

  for (const reply of [clarification, heartbeat, stillRunning]) {
    assert.deepEqual(lintTelegramConversationStyle(reply), [], reply);
    assert.doesNotMatch(reply, /^Mission$/m);
    assert.doesNotMatch(reply, /^Provider$/m);
    assert.doesNotMatch(reply, /^Move$/m);
    assert.doesNotMatch(reply, /How may I assist|Certainly!|As an AI/i);
    assert.ok((reply.match(/✅|⚠️|🟢|🟡|🔴|⚪|🛠️|✨/gu) || []).length <= 1);
  }

  assert.match(clarification, /Page\.\n\nRecommended starting point:/);
  assert.match(clarification, /presets\.\n\nSay "go" to start/);
  assert.match(heartbeat, /^still shaping Paragraph Spacing Smoke Page\.\n\nI will keep this quiet until the canvas is ready or something needs attention\./m);
  assert.match(stillRunning, /^still preparing Paragraph Spacing Smoke Page\. It is taking a little longer than usual, and I will send the canvas when it is ready\./m);
  assert.doesNotMatch(heartbeat, /🛠️|Canvas prep has been running/);
  assert.doesNotMatch(stillRunning, /🛠️|It has been shaping/);
});

test('launch real Telegram formatter outputs pass safety lint', () => {
  const replies = [
    formatRouteProbeReply({
      event_id: 'evt-123',
      event_type: 'tool_result_received',
      capability_key: 'spark_memory',
      status: 'success',
      route_latency_ms: 383,
      probe_summary: 'memory smoke write=succeeded/1 read_records=1 cleanup=ok'
    }),
    formatDiagnosticsScanReply({
      scanned_line_count: 120,
      failure_line_count: 0,
      findings: [],
      sources: ['relay.log', 'runtime.log'],
      service_checks: [{ status: 'ok' }, { status: 'ok' }],
      counts_by_subsystem: {},
      counts_by_failure_class: {},
      markdown_path: 'C:\\Users\\USER\\.spark\\diagnostics\\launch.md'
    }),
    formatSelfAwarenessReply({
      workspace_id: 'default',
      generated_at: '2026-05-08T10:00:00Z',
      recently_verified: [
        { claim: 'Recent tool_result_received: spark_memory via Telegram status=succeeded.' }
      ],
      lacks: [
        { claim: 'Registry visibility does not prove a chip, browser route, provider, or workflow succeeded this turn.' }
      ],
      improvement_options: [
        { claim: 'Add per-capability last_success_at, last_failure_reason, and eval coverage fields.' }
      ]
    }),
    renderSparkErrorReply(new Error('connect ECONNREFUSED 127.0.0.1:8787'), 'memory', false),
    renderSparkErrorReply(
      new Error('Command failed: python -c import runpy; runpy.run_module("spark_intelligence.cli", run_name="__main__") gateway simulate-telegram-update update.json'),
      'telegram',
      false
    )
  ];

  for (const reply of replies) {
    assert.deepEqual(lintTelegramReplySafety(reply), [], reply);
  }
  assert.doesNotMatch(replies[0], /tool_result_received/);
  assert.match(replies[0], /tool result received/);
});

test('launch non-Builder template replies pass safety lint', () => {
  const before = { ...process.env };
  try {
    process.env.SPARK_CHAT_LLM_PROVIDER = 'zai';
    process.env.SPARK_CHAT_LLM_MODEL = 'glm-5.1';
    process.env.SPARK_MISSION_LLM_PROVIDER = 'codex';
    process.env.SPARK_MISSION_LLM_MODEL = 'gpt-5.5';

    const replies = [
      renderChatRuntimeFailureReply(true, true),
      renderChatRuntimeFailureReply(false, false),
      buildMemoryBridgeUnavailableReply('remember'),
      buildMemoryBridgeUnavailableReply('recall'),
      buildMemoryBridgeUnavailableReply('about'),
      renderModelStatus(),
      renderModelRecommendations('anthropic'),
      renderSparkAccessBriefStatus('developer'),
      renderSparkAccessChangeConfirmation('agent'),
      renderSparkAccessDenial('chat', 'spawner_build'),
      renderSparkAccessRuntimeHint('agent')
    ];

    for (const reply of replies) {
      assert.deepEqual(lintTelegramReplySafety(reply), [], reply);
    }
  } finally {
    process.env = before;
  }
});
