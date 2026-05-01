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

// The runtime should mirror all first-party source, compiled entry files, and
// prompt knowledge used by the running gateway.
// Keep this discovered so new modules cannot quietly drift out of sync.
function discoverSyncedPaths() {
	const folders = [
		{ dir: 'src', ext: '.ts' },
		{ dir: 'dist', ext: '.js' },
		{ dir: 'agent-knowledge', ext: '.md' }
	];
	const paths = [];
	for (const folder of folders) {
		const abs = path.join(SOURCE_ROOT, folder.dir);
		if (!exists(abs)) continue;
		for (const name of fs.readdirSync(abs).sort()) {
			if (name.endsWith(folder.ext)) {
				paths.push(path.join(folder.dir, name).replace(/\\/g, '/'));
			}
		}
	}
	return paths;
}

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
	for (const rel of discoverSyncedPaths()) {
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
	for (const rel of discoverSyncedPaths()) {
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
