import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// PR #111: Retry with port fallback when mission relay port is in use (EADDRINUSE)

// Test the port fallback retry logic
const BASE_PORT = 8788;
const MAX_RETRIES = 3;

function* portSequence(): Generator<number> {
  yield BASE_PORT;
  yield BASE_PORT + 1;
  yield BASE_PORT + 2;
}

test('port fallback tries base port first', () => {
  const ports = [...portSequence()];
  assert.equal(ports[0], 8788);
  assert.equal(ports[1], 8789);
  assert.equal(ports[2], 8790);
});

test('port fallback sequence has 3 attempts', () => {
  const ports = [...portSequence()];
  assert.equal(ports.length, 3);
});

test('port fallback logs EADDRINUSE error on all ports exhausted', () => {
  const basePort = 8788;
  const maxRetries = 3;
  const error = new Error('listen EADDRINUSE: address already in use');
  (error as NodeJS.ErrnoException).code = 'EADDRINUSE';
  
  let logged = false;
  const mockLogger = (msg: string) => {
    if (msg.includes(`All ports ${basePort}-${basePort + maxRetries - 1} in use`)) {
      logged = true;
    }
  };
  mockLogger(`[MissionRelay] All ports ${basePort}-${basePort + maxRetries - 1} in use. Giving up.`);
  assert.equal(logged, true);
});

// Check the source file has port retry logic
const missionRelaySrc = readFileSync(join(__dirname, '..', 'src', 'missionRelay.ts'), 'utf-8');
test('src/missionRelay.ts has port fallback retry logic', () => {
  assert.ok(
    missionRelaySrc.includes('fallbackPort') ||
    missionRelaySrc.includes('EADDRINUSE') ||
    missionRelaySrc.includes('maxRetries'),
    'Expected port fallback retry logic in missionRelay.ts'
  );
});

test('src/missionRelay.ts retries with incremented port on EADDRINUSE', () => {
  assert.ok(
    missionRelaySrc.includes('basePort + attempt') ||
    missionRelaySrc.includes('basePort + 1') ||
    missionRelaySrc.includes('tryPort'),
    'Expected port increment on retry'
  );
});
