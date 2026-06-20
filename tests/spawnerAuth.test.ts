import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnerAuthHeaders } from '../src/spawnerAuth';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('reads Spawner bridge auth from local env file when process env is missing it', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spark-spawner-auth-'));
  writeFileSync(path.join(dir, '.env'), 'SPARK_BRIDGE_API_KEY=bridge-from-file\n', 'utf-8');

  try {
    const headers = spawnerAuthHeaders({}, { envFileDir: dir });

    assert.equal(headers['x-api-key'], 'bridge-from-file');
    assert.equal(headers['x-spawner-ui-key'], 'bridge-from-file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('prefers process env over local env file for Spawner bridge auth', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spark-spawner-auth-'));
  writeFileSync(path.join(dir, '.env'), 'SPARK_BRIDGE_API_KEY=bridge-from-file\n', 'utf-8');

  try {
    const headers = spawnerAuthHeaders(
      { SPARK_BRIDGE_API_KEY: 'bridge-from-process', SPARK_UI_API_KEY: 'ui-from-process' },
      { envFileDir: dir }
    );

    assert.equal(headers['x-api-key'], 'bridge-from-process');
    assert.equal(headers['x-spawner-ui-key'], 'ui-from-process');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uses event auth ordering for mission-control event surfaces', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spark-spawner-auth-'));
  writeFileSync(
    path.join(dir, '.env'),
    ['SPARK_BRIDGE_API_KEY=bridge-from-file', 'EVENTS_API_KEY=events-from-file', 'SPARK_UI_API_KEY=ui-from-file'].join('\n'),
    'utf-8'
  );

  try {
    const headers = spawnerAuthHeaders({}, { mode: 'events', envFileDir: dir });

    assert.equal(headers['x-api-key'], 'events-from-file');
    assert.equal(headers['x-spawner-ui-key'], 'ui-from-file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
