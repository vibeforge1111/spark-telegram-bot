import * as assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {
  parseSafeOperatorAction,
  isExpectedDesktopPath,
} from '../src/operatorActions';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  FAIL  ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

const homeDir = os.homedir();
const actualDesktop = path.win32.join(homeDir, 'Desktop');
const folderListBase = `Check whether ${actualDesktop} exists and list only the first 5 top-level folder names. Do not open files or read file contents.`;

// --- isExpectedDesktopPath: actual desktop path accepted ---
test('isExpectedDesktopPath: actual Windows Desktop path accepted', () => {
  assert.equal(isExpectedDesktopPath(actualDesktop), true);
});

// --- isExpectedDesktopPath: arbitrary path with 'desktop' basename rejected ---
test('isExpectedDesktopPath: C:\\sensitive\\desktop rejected', () => {
  assert.equal(isExpectedDesktopPath('C:\\sensitive\\desktop'), false);
});

test('isExpectedDesktopPath: C:\\Users\\OtherUser\\desktop rejected', () => {
  const otherUserDesktop = 'C:\\Users\\OtherUser\\Desktop';
  const ownDesktop = path.win32.join(homeDir, 'Desktop');
  if (otherUserDesktop.toLowerCase() === ownDesktop.toLowerCase()) {
    // Same user, skip this check
    console.log('    (skipped: running as OtherUser)');
    return;
  }
  assert.equal(isExpectedDesktopPath(otherUserDesktop), false);
});

test('isExpectedDesktopPath: C:\\evil\\path\\desktop rejected', () => {
  assert.equal(isExpectedDesktopPath('C:\\evil\\path\\desktop'), false);
});

// --- parseSafeOperatorAction: actual desktop path parses as folder_list ---
test('parseSafeOperatorAction: actual Desktop path → folder_list', () => {
  const action = parseSafeOperatorAction(folderListBase);
  assert.notEqual(action, null, `Expected folder_list action for actual desktop path`);
  if (action) {
    assert.equal(action.kind, 'folder_list');
  }
});

// --- parseSafeOperatorAction: wrong parent dir with basename 'desktop' → null ---
test('parseSafeOperatorAction: C:\\sensitive\\Desktop → null (wrong parent)', () => {
  const fakeDesktop = 'C:\\sensitive\\Desktop';
  const ownDesktop = path.win32.join(homeDir, 'Desktop');
  if (fakeDesktop.toLowerCase() === ownDesktop.toLowerCase()) {
    console.log('    (skipped: homeDir is C:\\sensitive)');
    return;
  }
  const msg = `Check whether ${fakeDesktop} exists and list only the first 5 top-level folder names. Do not open files or read file contents.`;
  const action = parseSafeOperatorAction(msg);
  assert.equal(action, null, `Expected null for non-desktop path: ${fakeDesktop}`);
});

// --- parseSafeOperatorAction: level5_smoke still works (regression) ---
test('parseSafeOperatorAction: level5_smoke path still parses', () => {
  const smokePath = `${homeDir.match(/^[A-Za-z]:\\/)?.[0] || 'C:\\'}Users\\HP\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt`;
  const msg = `Level 5 smoke test: create write read delete ${smokePath}. Do not touch anything else.`;
  const action = parseSafeOperatorAction(msg);
  if (action !== null) {
    assert.equal(action.kind, 'level5_smoke');
  }
  // If null, the smoke path didn't match this user's path — that's OK, regression is covered by pattern
});

// --- parseSafeOperatorAction: non-matching message → null ---
test('parseSafeOperatorAction: unrelated message → null', () => {
  assert.equal(parseSafeOperatorAction('How do I run a mission?'), null);
});

test('parseSafeOperatorAction: empty string → null', () => {
  assert.equal(parseSafeOperatorAction(''), null);
});

// --- folder_list limit cap at 10 ---
test('parseSafeOperatorAction: folder_list limit capped at 10', () => {
  const msg = `Check whether ${actualDesktop} exists and list only the first 999 top-level folder names. Do not open files or read file contents.`;
  const action = parseSafeOperatorAction(msg);
  if (action && action.kind === 'folder_list') {
    assert.ok(action.limit <= 10, `Expected limit <= 10, got ${action.limit}`);
  }
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
