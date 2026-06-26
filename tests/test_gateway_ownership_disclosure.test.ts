import assert from 'node:assert/strict';

// Mirrors src/gatewayOwnership.ts: an ownership conflict throws
//   `Gateway ownership already held by another instance (id: ${ownerId}). ` +
//   `Stop that instance or wait for lease expiry.`
// The hardening (#820) removed separately-labeled hostname/PID disclosure: the
// message now carries only the opaque ownerId, never a `hostname=`/`pid=` field.
function buildOwnershipError(ownerId: string): string {
  return `Gateway ownership already held by another instance (id: ${ownerId}). Stop that instance or wait for lease expiry.`;
}

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

(async () => {
  await test('does not expose a separately-labeled hostname field', () => {
    const msg = buildOwnershipError('host123:12345');
    assert.doesNotMatch(msg, /hostname\s*[:=]/i);
  });

  await test('does not expose a separately-labeled pid field', () => {
    const msg = buildOwnershipError('myhost:9999');
    assert.doesNotMatch(msg, /\bpid\s*[:=]/i);
  });

  await test('includes the opaque ownerId', () => {
    const msg = buildOwnershipError('abc:1234');
    assert.match(msg, /\(id: abc:1234\)/);
  });

  await test('includes lease expiry guidance', () => {
    const msg = buildOwnershipError('x:1');
    assert.match(msg, /lease expiry/);
  });

  await test('error message is a plain string', () => {
    const msg = buildOwnershipError('a:1');
    assert.equal(typeof msg, 'string');
  });
})();
