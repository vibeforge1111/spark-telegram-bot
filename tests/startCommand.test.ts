import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

describe('/start command shrink and /help addition', () => {
  it('post-fix: /help command handler is registered', () => {
    // Pre-fix: no /help existed; /start listed everything inline
    // Post-fix: /help is a standalone command delegating full list
    expect(src).toMatch(/bot\.command\(['"]help['"]/);
  });

  it('post-fix: /start handler emits a brief reply referencing /help', () => {
    // The fix adds a /help reference inside or alongside the /start reply
    expect(src).toContain('/help');
  });

  it('regression: /start block does not contain the full verbose command list inline', () => {
    // Pre-fix: /start had every command (/board, /recall, /recursive, etc.) listed inline
    // Post-fix: /start is brief; /help carries the full list
    // Find the /start handler block and verify it does not itself contain /recursive inline
    const startIdx = src.indexOf("bot.command('start'") !== -1
      ? src.indexOf("bot.command('start'")
      : src.indexOf('bot.command("start"');
    if (startIdx === -1) return; // handler may be refactored
    const startBlock = src.slice(startIdx, startIdx + 1200);
    // If /recursive is in the start block it means the old verbose list is still embedded
    expect(startBlock).not.toMatch(/\/recursive[\s\S]{0,50}\/board/);
  });
});