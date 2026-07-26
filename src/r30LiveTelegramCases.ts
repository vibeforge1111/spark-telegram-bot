import { createHash } from 'node:crypto';

export type R30LiveTelegramCase = {
  id: string;
  prompt: string;
  promptHash: string;
  expectedRoute: string;
  expectedAuthority: 'chat_only';
  expectedMutationClass: 'none';
  expectedReplyShape: 'natural';
  sideEffectExpectation: string;
};

function promptHash(prompt: string): string {
  return `sha256:${createHash('sha256').update(prompt).digest('hex')}`;
}

const CASE_DEFINITIONS: Array<Omit<R30LiveTelegramCase, 'promptHash'>> = [
  {
    id: 'r30-prd-fast-001',
    prompt: 'Write a PRD for a Telegram-first loop engineering dashboard. Use the PRD Writing domain chip if it fits, and do not launch a mission.',
    expectedRoute: 'prd_writing.fast_path',
    expectedAuthority: 'chat_only',
    expectedMutationClass: 'none',
    expectedReplyShape: 'natural',
    sideEffectExpectation: 'No mission, publish action, file edit, scheduler action, or external send.'
  },
  {
    id: 'r30-daily-fast-001',
    prompt: 'Help me make tomorrow easier with a daily schedule plan. Do not create reminders or change my calendar.',
    expectedRoute: 'daily_schedule.fast_path',
    expectedAuthority: 'chat_only',
    expectedMutationClass: 'none',
    expectedReplyShape: 'natural',
    sideEffectExpectation: 'No reminder, calendar mutation, mission, autoloop, or external send.'
  },
  {
    id: 'r30-daily-loop-advisory-001',
    prompt: 'Continue improving the Daily Schedule chip with a loop, but do not start an autoloop yet. What would the next safe loop be?',
    expectedRoute: 'daily_schedule.loop_advisory',
    expectedAuthority: 'chat_only',
    expectedMutationClass: 'none',
    expectedReplyShape: 'natural',
    sideEffectExpectation: 'No autoloop, mission, benchmark run, file change, or scheduler action.'
  },
  {
    id: 'r30-boundary-meta-timezone-001',
    prompt: 'We are discussing timezone routing bugs. Do not schedule anything; just explain which route should win.',
    expectedRoute: 'plain_chat.qa_boundary',
    expectedAuthority: 'chat_only',
    expectedMutationClass: 'none',
    expectedReplyShape: 'natural',
    sideEffectExpectation: 'No Daily Schedule fast path, reminder, calendar mutation, mission, or external send.'
  }
];

export const R30_LIVE_TELEGRAM_CASES: R30LiveTelegramCase[] = CASE_DEFINITIONS.map((entry) => ({
  ...entry,
  promptHash: promptHash(entry.prompt)
}));

export const R30_LIVE_TELEGRAM_REQUIRED_CASE_IDS = R30_LIVE_TELEGRAM_CASES.map((entry) => entry.id);
