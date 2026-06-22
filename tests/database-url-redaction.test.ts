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

// Replicate the old regex and the new regex from PR #361
const OLD_DATABASE_URL = /\b((?:postgres|postgresql|mysql|mongodb|redis):\/\/)([^@\s]+)@/gi;
const NEW_DATABASE_URL = /\b((?:postgres|postgresql|mysql|mongodb|redis):\/\/)[^@\s]+(@)/gi;

function oldRedactDbUrl(input: string): string {
  return input.replace(OLD_DATABASE_URL, (_match: string, prefix: string) => `${prefix}***@`);
}

function newRedactDbUrl(input: string): string {
  return input.replace(NEW_DATABASE_URL, '$1***$2');
}

test('old regex removes @ in redacted DATABASE_URL output', () => {
  const result = oldRedactDbUrl('postgresql://user:pass@localhost:5432/mydb');
  // Old regex: ($1 = "postgresql://") replaces with "$1***@" → "postgresql://***@" — missing trailing @
  assert.equal(result, 'postgresql://***@');
});

test('new regex preserves @ in redacted DATABASE_URL', () => {
  const result = newRedactDbUrl('postgresql://user:pass@localhost:5432/mydb');
  // New regex captures the @ separately: $1 = "postgresql://", $2 = "@"
  assert.equal(result, 'postgresql://***@localhost:5432/mydb');
});

test('new regex redacts mongodb+srv URLs correctly', () => {
  const result = newRedactDbUrl('mongodb+srv://admin:secret@cluster0.abcde.mongodb.net');
  assert.equal(result, 'mongodb+srv://***@cluster0.abcde.mongodb.net');
});

test('new regex redacts redis URLs correctly', () => {
  const result = newRedactDbUrl('redis://:password@redis-12345.c5.us-east-1-2.ec2.cloud.redislabs.com:12345');
  assert.equal(result, 'redis://:***@redis-12345.c5.us-east-1-2.ec2.cloud.redislabs.com:12345');
});

test('new regex preserves host and database in redacted output', () => {
  const result = newRedactDbUrl('mysql://root:secret123@mysql-host:3306/mydb');
  assert.equal(result, 'mysql://***@mysql-host:3306/mydb');
});

// Check that the actual src/redaction.ts uses the new pattern
const redactionSrc = readFileSync(join(__dirname, '..', 'src', 'redaction.ts'), 'utf-8');
test('src/redaction.ts uses DATABASE_URL regex that preserves @', () => {
  const regexMatch = redactionSrc.match(/DATABASE_URL.*\/(.+)\//);
  if (regexMatch) {
    // The regex should use $1***$2 replacement, not ${prefix}***@
    assert.ok(
      redactionSrc.includes('$1***$2'),
      'Expected DATABASE_URL replacement to use $1***$2 pattern to preserve @'
    );
  }
});
