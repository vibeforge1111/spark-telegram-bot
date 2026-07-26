import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readAuthorityStatusSummary,
  renderAuthorityStatusSummary,
  summarizeAuthorityView
} from '../src/authorityStatus';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const authorityView = {
  authority: 'observability_non_authoritative',
  default_access_level_hint: 4,
  configured_telegram_profile_count: 1,
  telegram_profile_count: 5,
  cli_access: {
    default_sandbox_lane: 'spark_workspace',
    source: 'C:/private/source/access.py'
  },
  cli_capability_policy: {
    toxic_pair_count: 5,
    toxic_capability_pairs: [
      { left: 'secret_access', right: 'network_write', reason: 'secret detail should stay out' }
    ]
  },
  telegram_access_policy: {
    profiles: [
      { profile: 'chat', level: 1 },
      { profile: 'builder', level: 2 },
      { profile: 'agent', level: 3 },
      { profile: 'developer', level: 4 },
      { profile: 'operator', level: 5 }
    ]
  },
  spawner_execution_policy: {
    lane_ids: ['spark_workspace', 'docker', 'ssh', 'modal', 'level5_operator']
  },
  browser_authority: {
    hook_count: 20,
    approval_mode_counts: {
      not_required: 15,
      ask_once: 4,
      operator_only: 1
    }
  },
  public_output_authority: {
    required_publication_checks: ['spark-insight-schema', 'spark-insight-secrets', 'spark-insight-policy']
  },
  guardrail_summary: {
    browser_approval_required_hook_count: 5,
    publication_checks_required: 3,
    toxic_pair_count: 5
  },
  observed_sources: {
    secret_path: { path: 'C:/private/source/secret.env', exists: true }
  }
};

async function main(): Promise<void> {
  await test('renders compact authority summary without source paths or reasons', () => {
    const summary = summarizeAuthorityView(authorityView);
    const reply = renderAuthorityStatusSummary(summary);

    assert.equal(summary.present, true);
    assert.equal(summary.defaultAccessLevel, 4);
    assert.equal(summary.telegramProfileCount, 5);
    assert.equal(summary.configuredTelegramProfileCount, 1);
    assert.equal(summary.browserApprovalRequiredHookCount, 5);
    assert.match(reply, /Authority view has gated actions/);
    assert.match(reply, /Access L4; lane spark_workspace/);
    assert.match(reply, /5 Telegram access profiles; 5 Spawner lanes/);
    assert.match(reply, /5 browser approvals from 20 hooks/);
    assert.match(reply, /This is evidence, not permission/);
    assert.match(reply, /Full evidence: `spark os authority --json`/);
    assert.doesNotMatch(reply, /C:\/private/);
    assert.doesNotMatch(reply, /secret detail/);
    assert.doesNotMatch(reply, /secret_path/);
  });

  await test('falls back to nested profile and approval counts', () => {
    const summary = summarizeAuthorityView({
      cli_access: { default_access_level: 3, default_sandbox_lane: 'spark_workspace' },
      telegram_access_policy: { profiles: [{ profile: 'chat' }, { profile: 'agent' }] },
      spawner_execution_policy: { lane_ids: ['spark_workspace'] },
      browser_authority: {
        hook_count: 3,
        approval_mode_counts: { not_required: 1, ask_once: 1, operator_only: 1 }
      },
      public_output_authority: { required_publication_checks: ['schema'] },
      cli_capability_policy: { toxic_pair_count: 2 }
    });

    assert.equal(summary.defaultAccessLevel, 3);
    assert.equal(summary.telegramProfileCount, 2);
    assert.equal(summary.browserApprovalRequiredHookCount, 2);
    assert.equal(summary.publicationChecksRequired, 1);
  });

  await test('reads authority view from compiled system map directory', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'spark-authority-status-'));
    const viewPath = path.join(root, 'authority-view.json');
    writeFileSync(viewPath, JSON.stringify(authorityView), 'utf-8');

    const summary = await readAuthorityStatusSummary(viewPath);

    assert.equal(summary.present, true);
    assert.equal(summary.spawnerLaneCount, 5);
    assert.equal(summary.publicationChecksRequired, 3);
  });

  await test('missing authority view gives compile prompt', async () => {
    const summary = await readAuthorityStatusSummary(path.join(os.tmpdir(), 'missing-authority-view.json'));
    const reply = renderAuthorityStatusSummary(summary);

    assert.equal(summary.present, false);
    assert.match(reply, /not compiled yet/);
    assert.match(reply, /spark os compile/);
  });

  await test('corrupt authority view is not described as never compiled', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'spark-authority-corrupt-'));
    const viewPath = path.join(root, 'authority-view.json');
    writeFileSync(viewPath, '{"authority":', 'utf-8');

    const summary = await readAuthorityStatusSummary(viewPath);
    const reply = renderAuthorityStatusSummary(summary);

    assert.equal(summary.present, false);
    assert.match(reply, /could not be read/i);
    assert.match(reply, /spark os compile/);
    assert.match(reply, /spark os authority --json/);
    assert.doesNotMatch(reply, /not compiled yet/i);
    assert.doesNotMatch(reply, /Unexpected|position|authority-view\.json/i);
  });
}

void main();
