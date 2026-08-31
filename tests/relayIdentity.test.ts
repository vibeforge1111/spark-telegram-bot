import assert from 'node:assert/strict';
import {
  DEFAULT_TELEGRAM_RELAY_PORT,
  PRIMARY_TELEGRAM_RELAY_PROFILE,
  normalizeTelegramRelayPort,
  normalizeTelegramRelayProfile,
  normalizeTelegramRelayUrl,
  telegramRelayIdentityFromEnv,
} from '../src/relayIdentity';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('normalizeTelegramRelayPort falls back when env is missing or unusable', () => {
  assert.equal(normalizeTelegramRelayPort(undefined), DEFAULT_TELEGRAM_RELAY_PORT);
  assert.equal(normalizeTelegramRelayPort(''), DEFAULT_TELEGRAM_RELAY_PORT);
  assert.equal(normalizeTelegramRelayPort('not-a-port'), DEFAULT_TELEGRAM_RELAY_PORT);
  assert.equal(normalizeTelegramRelayPort('0'), DEFAULT_TELEGRAM_RELAY_PORT);
  assert.equal(normalizeTelegramRelayPort('-1'), DEFAULT_TELEGRAM_RELAY_PORT);
  assert.equal(normalizeTelegramRelayPort('99999'), DEFAULT_TELEGRAM_RELAY_PORT);
});

test('normalizeTelegramRelayPort accepts integer-like values inside the valid range', () => {
  assert.equal(normalizeTelegramRelayPort(9000), 9000);
  assert.equal(normalizeTelegramRelayPort('9000'), 9000);
  assert.equal(normalizeTelegramRelayPort(65535), 65535);
  assert.equal(normalizeTelegramRelayPort('1'), 1);
});

test('normalizeTelegramRelayPort truncates fractional values rather than rounding', () => {
  assert.equal(normalizeTelegramRelayPort('9000.7'), 9000);
  assert.equal(normalizeTelegramRelayPort(8788.999), 8788);
});

test('normalizeTelegramRelayProfile defaults blanks to primary', () => {
  assert.equal(normalizeTelegramRelayProfile(undefined), PRIMARY_TELEGRAM_RELAY_PROFILE);
  assert.equal(normalizeTelegramRelayProfile(''), PRIMARY_TELEGRAM_RELAY_PROFILE);
  assert.equal(normalizeTelegramRelayProfile('   '), PRIMARY_TELEGRAM_RELAY_PROFILE);
  assert.equal(normalizeTelegramRelayProfile(42), PRIMARY_TELEGRAM_RELAY_PROFILE);
});

test('normalizeTelegramRelayProfile trims and preserves explicit profile names', () => {
  assert.equal(normalizeTelegramRelayProfile('secondary'), 'secondary');
  assert.equal(normalizeTelegramRelayProfile('  staging  '), 'staging');
});

test('normalizeTelegramRelayUrl rejects unsupported and malformed values', () => {
  assert.equal(normalizeTelegramRelayUrl(undefined), undefined);
  assert.equal(normalizeTelegramRelayUrl(''), undefined);
  assert.equal(normalizeTelegramRelayUrl('   '), undefined);
  assert.equal(normalizeTelegramRelayUrl(123), undefined);
  assert.equal(normalizeTelegramRelayUrl('ftp://relay.example.com/spawner-events'), undefined);
  assert.equal(normalizeTelegramRelayUrl('not a url'), undefined);
});

test('normalizeTelegramRelayUrl back-fills the spawner-events path when omitted', () => {
  assert.equal(
    normalizeTelegramRelayUrl('https://relay.example.com'),
    'https://relay.example.com/spawner-events'
  );
  assert.equal(
    normalizeTelegramRelayUrl('https://relay.example.com/'),
    'https://relay.example.com/spawner-events'
  );
});

test('normalizeTelegramRelayUrl preserves explicit paths and query and drops fragments', () => {
  assert.equal(
    normalizeTelegramRelayUrl('https://relay.example.com/custom-path'),
    'https://relay.example.com/custom-path'
  );
  assert.equal(
    normalizeTelegramRelayUrl('https://relay.example.com/path?token=abc#section'),
    'https://relay.example.com/path?token=abc'
  );
});

test('telegramRelayIdentityFromEnv assembles a complete identity record', () => {
  const identity = telegramRelayIdentityFromEnv({
    TELEGRAM_RELAY_PORT: '9100',
    SPARK_TELEGRAM_PROFILE: 'staging',
    TELEGRAM_RELAY_URL: 'https://relay.example.com/inbound',
  } as NodeJS.ProcessEnv);
  assert.equal(identity.port, 9100);
  assert.equal(identity.profile, 'staging');
  assert.equal(identity.url, 'https://relay.example.com/inbound');
});

test('telegramRelayIdentityFromEnv omits url field when no usable url is provided', () => {
  const identity = telegramRelayIdentityFromEnv({} as NodeJS.ProcessEnv);
  assert.equal(identity.port, DEFAULT_TELEGRAM_RELAY_PORT);
  assert.equal(identity.profile, PRIMARY_TELEGRAM_RELAY_PROFILE);
  assert.equal('url' in identity, false);
});

test('telegramRelayIdentityFromEnv accepts SPARK_TELEGRAM_RELAY_URL as a fallback', () => {
  const identity = telegramRelayIdentityFromEnv({
    SPARK_TELEGRAM_RELAY_URL: 'http://relay.example.com',
  } as NodeJS.ProcessEnv);
  assert.equal(identity.url, 'http://relay.example.com/spawner-events');
});
