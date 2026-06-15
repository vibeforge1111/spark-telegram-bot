import assert from 'node:assert/strict';
import {
  matchingShippedProjectForSpawnerArtifact,
  spawnerArtifactReplyContradictsEvidence
} from '../src/spawnerArtifactReadoutGuard';

const artifact = {
  projectName: 'Day Triage Button',
  requestId: 'prd-tg-build-f92e5de5f239-1781530332866',
  missionId: 'mission-1781530332866',
  status: 'processed',
  resultAvailable: true
};

const shippedProject = {
  chatId: '1278511160',
  userId: '1278511160',
  projectName: 'Mission 1781530332866 Day Triage Button',
  projectPath: 'C:/Users/USER/.spark/workspaces/mission-1781530332866-day-triage-button',
  previewUrl: 'http://127.0.0.1:3333/preview/day-triage/index.html',
  missionId: 'mission-1781530332866',
  requestId: 'tg-build-f92e5de5f239-1781530332866',
  iteration: 1,
  shippedAt: '2026-06-15T13:44:49.496Z',
  updatedAt: '2026-06-15T13:44:49.496Z'
};

assert.equal(
  matchingShippedProjectForSpawnerArtifact(artifact, shippedProject),
  shippedProject,
  'same-mission shipped preview must match even when the canvas pipeline adds the prd- request prefix'
);

assert.equal(
  spawnerArtifactReplyContradictsEvidence(
    'Day Triage Button proof, separated:\n\nPreview evidence\n. I cannot prove a shipped preview exists right now. No preview URL or shipped app proof is visible in this turn.\n\nCanvas evidence\n. Mission appears processed with result available.',
    { shippedProject }
  ),
  true,
  'generated readouts must not hide matching shipped preview evidence'
);

assert.equal(
  spawnerArtifactReplyContradictsEvidence(
    'Day Triage Button has canvas/result evidence, and a matching shipped preview exists: http://127.0.0.1:3333/preview/day-triage/index.html',
    { shippedProject }
  ),
  false,
  'generated readouts may mention shipped preview evidence when the owner evidence proves it'
);

assert.equal(
  spawnerArtifactReplyContradictsEvidence(
    'Day Triage Button has a current preview: http://127.0.0.1:3333/preview/day-triage/index.html',
    { shippedProject: null }
  ),
  true,
  'generated readouts must not invent preview evidence when none is in the owner packet'
);

console.log('ok - spawner artifact readout guard');
