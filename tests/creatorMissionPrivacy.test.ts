import assert from 'node:assert/strict';
import { parseNaturalCreatorMissionIntent } from '../src/conversationIntent';

const localInsightPacket = parseNaturalCreatorMissionIntent(
  'create a shareable insight packet for Startup YC. Do not publish it.'
);
assert.equal(localInsightPacket?.privacyMode, 'local_only');
assert.equal(localInsightPacket?.riskLevel, 'medium');
assert.match(localInsightPacket?.brief || '', /shareable insight packet/i);
assert.match(localInsightPacket?.brief || '', /network_absorbable=false/);
assert.equal(
  parseNaturalCreatorMissionIntent('create a benchmarked specialization path and draft a GitHub pull request for review')?.privacyMode,
  'github_pr'
);
assert.equal(
  parseNaturalCreatorMissionIntent('create a benchmarked specialization path for pull request risk review')?.privacyMode,
  'local_only'
);
console.log('ok - creator mission privacy treats PR review domains as local unless the user asks to draft a PR');
