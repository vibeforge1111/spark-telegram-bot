#!/usr/bin/env node
/**
 * sync-runtime.cjs - mirror spark-telegram-bot edits into the runtime copy.
 *
 * The bot that spark.cmd actually launches is resolved from
 * ~/.spark/state/installed.json. Older installs used
 * ~/.spark/modules/spark-telegram-bot/source as a fallback, but installed
 * state is the live authority.
 *
 * Run after `npm run build` (which writes to ./dist) and before
 * `spark.cmd restart spark-telegram-bot --profile spark-agi` to ensure
 * the running bot sees your changes.
 *
 * Usage:
 *   node scripts/sync-runtime.cjs            # one-shot
 *   node scripts/sync-runtime.cjs --check    # exit 1 if drift detected
 *   node scripts/sync-runtime.cjs --check --require-runtime
 *                                             # also fail if runtime is missing
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SOURCE_ROOT = path.resolve(__dirname, '..');
const MODULE_ID = 'spark-telegram-bot';
const FALLBACK_RUNTIME_ROOT = path.join(os.homedir(), '.spark', 'modules', MODULE_ID, 'source');
const RUNTIME_BACKUP_DIR = '.spark-runtime-sync-backups';

function installedRuntimeRoot() {
	if (process.env.SPARK_TELEGRAM_RUNTIME_ROOT) {
		return path.resolve(process.env.SPARK_TELEGRAM_RUNTIME_ROOT);
	}
	const installedJson = path.join(os.homedir(), '.spark', 'state', 'installed.json');
	if (!exists(installedJson)) return FALLBACK_RUNTIME_ROOT;
	try {
		const installed = JSON.parse(fs.readFileSync(installedJson, 'utf8'));
		const record = installed && installed[MODULE_ID];
		const configured = record && (record.path || record.source);
		return configured ? path.resolve(configured) : FALLBACK_RUNTIME_ROOT;
	} catch {
		return FALLBACK_RUNTIME_ROOT;
	}
}

const RUNTIME_ROOT = installedRuntimeRoot();
const TEXT_SYNC_EXTENSIONS = new Set([
	'.cjs',
	'.d.ts',
	'.js',
	'.json',
	'.md',
	'.mjs',
	'.toml',
	'.ts'
]);

// The runtime should mirror all first-party source, compiled entry files, and
// prompt/eval knowledge used by the running gateway and its upgrade smoke.
// Keep this discovered so new modules cannot quietly drift out of sync.
function discoverSyncedPaths() {
	const folders = [
		{ dir: 'src', ext: '.ts' },
		{ dir: 'dist', ext: '.js' },
		{ dir: 'scripts', ext: '.cjs' },
		{ dir: 'ops', ext: '.ts' },
		{ dir: 'ops', ext: '.json' },
		{ dir: 'agent-knowledge', ext: '.md' },
		{ dir: 'vendor/harness-core', ext: null, recursive: true },
		{ dir: 'node_modules/@spark/harness-core', ext: null, recursive: true }
	];
	const singletonPaths = [
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'spark.toml',
		'ops/capability-natural-language-matrix.json'
	];
	const paths = [...singletonPaths.filter((rel) => exists(path.join(SOURCE_ROOT, rel)))];
	for (const folder of folders) {
		const abs = path.join(SOURCE_ROOT, folder.dir);
		if (!exists(abs)) continue;
		if (folder.recursive) {
			paths.push(...discoverFiles(folder.dir, folder.ext));
		} else {
			for (const name of fs.readdirSync(abs).sort()) {
				if (name.endsWith(folder.ext)) {
					paths.push(path.join(folder.dir, name).replace(/\\/g, '/'));
				}
			}
		}
	}
	return paths;
}

function discoverFiles(relDir, ext) {
	const dir = path.join(SOURCE_ROOT, relDir);
	const discovered = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const rel = path.join(relDir, entry.name).replace(/\\/g, '/');
		const abs = path.join(SOURCE_ROOT, rel);
		if (entry.isDirectory()) {
			discovered.push(...discoverFiles(rel, ext));
		} else if (entry.isFile() && (ext === null || entry.name.endsWith(ext))) {
			discovered.push(rel);
		}
	}
	return discovered;
}

function discoverDistJs(root) {
	const dir = path.join(root, 'dist');
	if (!exists(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
		.map((entry) => path.join('dist', entry.name).replace(/\\/g, '/'))
		.sort();
}

function exists(p) {
	try { fs.accessSync(p); return true; } catch { return false; }
}

function isTextSyncPath(rel) {
	const normalized = rel.replace(/\\/g, '/');
	if (normalized === 'spark.toml') return true;
	return TEXT_SYNC_EXTENSIONS.has(path.extname(normalized));
}

function comparableBytes(rel, p) {
	if (!exists(p)) return null;
	const bytes = fs.readFileSync(p);
	if (!isTextSyncPath(rel) || bytes.includes(0)) return bytes;
	return Buffer.from(bytes.toString('utf8').replace(/\r\n?/g, '\n'), 'utf8');
}

function checksum(rel, p) {
	const bytes = comparableBytes(rel, p);
	if (bytes === null) return null;
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

function staleRuntimeDistPaths() {
	const canonicalDist = new Set(discoverDistJs(SOURCE_ROOT));
	return discoverDistJs(RUNTIME_ROOT).filter((rel) => !canonicalDist.has(rel));
}

function archiveStaleRuntimeDist() {
	const stale = staleRuntimeDistPaths();
	if (stale.length === 0) return null;

	const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
	const backupRel = path.join(RUNTIME_BACKUP_DIR, stamp).replace(/\\/g, '/');
	const backupRoot = path.join(RUNTIME_ROOT, backupRel);
	const moved = [];

	try {
		for (const rel of stale) {
			const src = path.join(RUNTIME_ROOT, rel);
			const dst = path.join(backupRoot, rel);
			fs.mkdirSync(path.dirname(dst), { recursive: true });
			fs.renameSync(src, dst);
			moved.push(rel);
		}
		fs.writeFileSync(
			path.join(backupRoot, 'manifest.json'),
			`${JSON.stringify({
				schemaVersion: 1,
				createdAt: new Date().toISOString(),
				reason: 'stale runtime dist paths absent from the canonical source build',
				moved
			}, null, 2)}\n`,
			'utf8'
		);
	} catch (error) {
		for (const rel of moved.reverse()) {
			const src = path.join(backupRoot, rel);
			const dst = path.join(RUNTIME_ROOT, rel);
			if (!exists(src) || exists(dst)) continue;
			fs.mkdirSync(path.dirname(dst), { recursive: true });
			fs.renameSync(src, dst);
		}
		throw error;
	}

	return { backupRel, moved };
}

function syncOnce({ silent = false } = {}) {
	if (!exists(RUNTIME_ROOT)) {
		console.warn(`[sync] runtime not present at ${RUNTIME_ROOT} — skipping.`);
		return;
	}
	const archived = archiveStaleRuntimeDist();
	if (archived && !silent) {
		console.log(`[sync] archived ${archived.moved.length} stale dist path(s) to ${archived.backupRel}.`);
	}
	let synced = 0;
	for (const rel of discoverSyncedPaths()) {
		const src = path.join(SOURCE_ROOT, rel);
		const dst = path.join(RUNTIME_ROOT, rel);
		if (checksum(rel, src) === checksum(rel, dst)) continue;
		if (copyOne(rel)) {
			synced++;
			if (!silent) console.log(`[sync] -> ${rel}`);
		}
	}
	if (!silent) console.log(synced > 0 ? `[sync] ${synced} path(s) updated.` : '[sync] nothing to do.');
}

function checkDrift({ requireRuntime = false } = {}) {
	if (!exists(RUNTIME_ROOT)) {
		console.error(`[check] runtime not present at ${RUNTIME_ROOT}`);
		process.exit(requireRuntime ? 1 : 0);
	}
	const drift = [];
	for (const rel of discoverSyncedPaths()) {
		const a = checksum(rel, path.join(SOURCE_ROOT, rel));
		const b = checksum(rel, path.join(RUNTIME_ROOT, rel));
		if (a !== b) drift.push(rel);
	}
	const canonicalDist = new Set(discoverDistJs(SOURCE_ROOT));
	for (const rel of discoverDistJs(RUNTIME_ROOT)) {
		if (!canonicalDist.has(rel)) drift.push(rel);
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

const args = new Set(process.argv.slice(2));
if (args.has('--check')) checkDrift({ requireRuntime: args.has('--require-runtime') });
else syncOnce();
