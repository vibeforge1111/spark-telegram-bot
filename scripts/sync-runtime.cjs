#!/usr/bin/env node
/**
 * sync-runtime.cjs — mirror spark-telegram-bot edits into the runtime copy.
 *
 * The bot that spark.cmd actually launches lives at
 * ~/.spark/modules/spark-telegram-bot/source/. Edits made in this Desktop
 * checkout don't reach that runtime — same pattern as spawner-ui.
 *
 * Run after `npm run build` (which writes to ./dist) and before
 * `spark.cmd restart spark-telegram-bot --profile spark-agi` to ensure
 * the running bot sees your changes.
 *
 * Usage:
 *   node scripts/sync-runtime.cjs            # one-shot
 *   node scripts/sync-runtime.cjs --check    # exit 1 if drift detected
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const RUNTIME_ROOT = path.join(os.homedir(), '.spark', 'modules', 'spark-telegram-bot', 'source');

// Files that must stay in sync. Add new modules to this list as the bot
// surface grows. dist/ entries are required because the runtime runs the
// compiled output.
const SYNCED_PATHS = [
	'src/accessPolicy.ts',
	'src/buildIntent.ts',
	'src/builderBridge.ts',
	'src/chipCreate.ts',
	'src/conversation.ts',
	'src/conversationIntent.ts',
	'src/errorExplain.ts',
	'src/llm.ts',
	'src/localWorkspace.ts',
	'src/missionControl.ts',
	'src/outboundSanitize.ts',
	'src/timeoutConfig.ts',
	'src/userTier.ts',
	'src/index.ts',
	'src/spawner.ts',
	'dist/accessPolicy.js',
	'dist/buildIntent.js',
	'dist/builderBridge.js',
	'dist/chipCreate.js',
	'dist/conversation.js',
	'dist/conversationIntent.js',
	'dist/errorExplain.js',
	'dist/llm.js',
	'dist/localWorkspace.js',
	'dist/missionControl.js',
	'dist/outboundSanitize.js',
	'dist/timeoutConfig.js',
	'dist/userTier.js',
	'dist/index.js',
	'dist/spawner.js'
];

function exists(p) {
	try { fs.accessSync(p); return true; } catch { return false; }
}

function checksum(p) {
	if (!exists(p)) return null;
	const bytes = fs.readFileSync(p);
	return require('crypto').createHash('md5').update(bytes).digest('hex');
}

function copyOne(rel) {
	const src = path.join(SOURCE_ROOT, rel);
	const dst = path.join(RUNTIME_ROOT, rel);
	if (!exists(src)) {
		console.warn(`[sync] missing source: ${rel}`);
		return false;
	}
	fs.mkdirSync(path.dirname(dst), { recursive: true });
	fs.copyFileSync(src, dst);
	return true;
}

function syncOnce({ silent = false } = {}) {
	if (!exists(RUNTIME_ROOT)) {
		console.warn(`[sync] runtime not present at ${RUNTIME_ROOT} — skipping.`);
		return;
	}
	let synced = 0;
	for (const rel of SYNCED_PATHS) {
		const src = path.join(SOURCE_ROOT, rel);
		const dst = path.join(RUNTIME_ROOT, rel);
		if (checksum(src) === checksum(dst)) continue;
		if (copyOne(rel)) {
			synced++;
			if (!silent) console.log(`[sync] -> ${rel}`);
		}
	}
	if (!silent) console.log(synced > 0 ? `[sync] ${synced} path(s) updated.` : '[sync] nothing to do.');
}

function checkDrift() {
	if (!exists(RUNTIME_ROOT)) {
		console.error(`[check] runtime not present at ${RUNTIME_ROOT}`);
		process.exit(0);
	}
	const drift = [];
	for (const rel of SYNCED_PATHS) {
		const a = checksum(path.join(SOURCE_ROOT, rel));
		const b = checksum(path.join(RUNTIME_ROOT, rel));
		if (a !== b) drift.push(rel);
	}
	if (drift.length === 0) {
		console.log('[check] runtime in sync.');
		process.exit(0);
	}
	console.error('[check] DRIFT detected:');
	for (const d of drift) console.error(`  - ${d}`);
	console.error('Run `node scripts/sync-runtime.cjs` to fix.');
	process.exit(1);
}

const arg = process.argv[2];
if (arg === '--check') checkDrift();
else syncOnce();
