import assert from 'node:assert/strict';
import { renderStartupBenchDossier, renderStartupReleaseVerdict } from '../src/sparkQaOperator';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('keeps the private Startup Bench dossier path out of Telegram replies', () => {
  const dossierPath = '/Users/operator/.spark/private/startup_bench_proof_report.bound.json';
  const dossier = {
    privateScoreSummary: {
      baseline: { scenarioScore: 0.5 },
      candidate: { scenarioScore: 0.7 },
      comparison: { candidateMinusBaseline: 0.2 }
    },
    promotionDossier: {
      scoreClaimAllowed: true,
      improvementClaimAllowed: true,
      nextGate: 'human_review'
    }
  };
  const benchReply = renderStartupBenchDossier({ ok: true, dossierPath, dossier });
  const releaseReply = renderStartupReleaseVerdict({
    ok: true,
    dossierPath,
    dossier,
    verdict: {
      localImprovementEvidence: true,
      releaseClaimAllowed: true,
      publicReady: false,
      networkAbsorbable: false,
      blockers: [],
      nextGate: 'human review'
    }
  });

  for (const reply of [benchReply, releaseReply]) {
    assert.doesNotMatch(reply, /\/Users\/operator|startup_bench_proof_report/);
    assert.match(reply, /available in the local Spark QA proof bundle/);
  }
});
