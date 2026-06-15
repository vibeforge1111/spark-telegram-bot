#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const VENDOR_ROOT = path.join(REPO_ROOT, 'vendor', 'harness-core');
const MANIFEST_PATH = path.join(VENDOR_ROOT, 'CHECKSUMS.json');
const WRITE = process.argv.includes('--write');

function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
		.sort((a, b) => a.name.localeCompare(b.name));
	const files = [];
	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		const rel = path.relative(VENDOR_ROOT, abs).replace(/\\/g, '/');
		if (rel === 'CHECKSUMS.json') continue;
		if (entry.isDirectory()) {
			files.push(...walk(abs));
		} else if (entry.isFile()) {
			const bytes = fs.readFileSync(abs);
			files.push({
				path: rel,
				sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
				bytes: bytes.length
			});
		}
	}
	return files;
}

function currentManifest() {
	return {
		schemaVersion: 1,
		root: 'vendor/harness-core',
		files: walk(VENDOR_ROOT)
	};
}

function fail(lines) {
	for (const line of lines) console.error(line);
	process.exit(1);
}

if (!fs.existsSync(VENDOR_ROOT)) {
	fail([`[vendor] missing vendor root: ${VENDOR_ROOT}`]);
}

const actual = currentManifest();

if (WRITE) {
	fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
	console.log(`[vendor] wrote ${path.relative(REPO_ROOT, MANIFEST_PATH).replace(/\\/g, '/')}`);
	process.exit(0);
}

if (!fs.existsSync(MANIFEST_PATH)) {
	fail(['[vendor] CHECKSUMS.json is missing. Run `node scripts/verify-vendor.cjs --write` after a deliberate vendor refresh.']);
}

const expected = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
if (expected.schemaVersion !== 1 || expected.root !== 'vendor/harness-core' || !Array.isArray(expected.files)) {
	fail(['[vendor] CHECKSUMS.json has an unsupported shape.']);
}

const expectedByPath = new Map(expected.files.map((file) => [file.path, file]));
const actualByPath = new Map(actual.files.map((file) => [file.path, file]));
const errors = [];

for (const [rel, expectedFile] of expectedByPath) {
	const actualFile = actualByPath.get(rel);
	if (!actualFile) {
		errors.push(`[vendor] missing file: ${rel}`);
		continue;
	}
	if (actualFile.sha256 !== expectedFile.sha256 || actualFile.bytes !== expectedFile.bytes) {
		errors.push(`[vendor] checksum mismatch: ${rel}`);
	}
}

for (const rel of actualByPath.keys()) {
	if (!expectedByPath.has(rel)) errors.push(`[vendor] extra file: ${rel}`);
}

if (errors.length > 0) fail(errors);

console.log(`[vendor] harness-core checksums ok (${actual.files.length} files).`);
