import assert from 'node:assert/strict';

function forgetTarget(text: string): string {
  return text.replace(/^\/forget\b/, '').trim();
}

assert.equal(forgetTarget('/forget my-project'), 'my-project');
assert.equal(forgetTarget('/forgetSomethingElse'), '/forgetSomethingElse');
console.log('ok - /forget uses word-boundary regex');
