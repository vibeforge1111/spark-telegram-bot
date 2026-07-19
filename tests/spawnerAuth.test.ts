import assert from 'node:assert/strict';
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

test('does not elevate a hosted UI key into Spawner control authority', () => {
  assert.deepEqual(
    spawnerAuthHeaders({ SPARK_UI_API_KEY: 'ui-only-secret' } as NodeJS.ProcessEnv),
    { 'x-spawner-ui-key': 'ui-only-secret' }
  );
});

test('may reuse a control key for UI compatibility without reverse privilege elevation', () => {
  assert.deepEqual(
    spawnerAuthHeaders({ SPARK_BRIDGE_API_KEY: 'bridge-only-secret' } as NodeJS.ProcessEnv),
    {
      'x-api-key': 'bridge-only-secret',
      'x-spawner-ui-key': 'bridge-only-secret'
    }
  );
});
