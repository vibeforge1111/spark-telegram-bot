import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { harnessExecutionAuthorityFailureReason } from '../src/harnessExecutionAuthority';

interface CapturedCall {
	url: string;
	body: any;
}

function makeFakeCtx(chatId: number, fromId: number, messageId: number, replies: string[]) {
	const chat = { id: chatId, type: 'private' };
	const from = { id: fromId, username: 'cem', is_bot: false, first_name: 'Cem' };
	const message = {
		message_id: messageId,
		text: '',
		date: Math.floor(Date.now() / 1000),
		chat,
		from
	};
	return {
		chat,
		from,
		message,
		update: { update_id: messageId, message },
		sendChatAction: async (_action: string) => {},
		reply: async (text: string) => {
			replies.push(text);
		}
	};
}

function assertBuilderChipCreateAuthority(authority: any): void {
	assert.equal(authority?.schema_version, 'governor-decision-v1');
	assert.equal(authority?.outcome, 'execute');
	assert.equal(authority?.execution_boundary?.action_authorized, true);
	assert.equal(authority?.tool_ledgers?.[0]?.tool_name, 'chip.create');
	assert.equal(harnessExecutionAuthorityFailureReason(authority, {
		toolName: 'chip.create',
		ownerSystem: 'spark-intelligence-builder',
		actionType: 'create_domain_chip'
	}), null);
}

async function run(): Promise<void> {
	const originalPost = axios.post;
	const originalGet = axios.get;
	const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-pending-authority-'));
	const fakeBuilder = path.join(tempDir, 'fake-builder');
	const builderArgvPath = path.join(tempDir, 'builder-argv.json');
	const builderHome = path.join(tempDir, 'builder-home');
	const outputDir = path.join(tempDir, 'chips');
	const chipLabsRoot = path.join(tempDir, 'chip-labs');
	const originalEnv = {
		ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
		BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
		CHIP_CREATE_OUTPUT_DIR: process.env.CHIP_CREATE_OUTPUT_DIR,
		SPARK_BUILDER_HOME: process.env.SPARK_BUILDER_HOME,
		SPARK_BUILDER_PYTHON: process.env.SPARK_BUILDER_PYTHON,
		SPARK_BUILDER_REPO: process.env.SPARK_BUILDER_REPO,
		SPARK_DOMAIN_CHIP_LABS_ROOT: process.env.SPARK_DOMAIN_CHIP_LABS_ROOT,
		SPARK_MISSION_CONTROL_DISABLED: process.env.SPARK_MISSION_CONTROL_DISABLED,
		SPAWNER_UI_URL: process.env.SPAWNER_UI_URL,
		SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
		SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
		SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
		SPARK_MODEL_ROUTER: process.env.SPARK_MODEL_ROUTER
	};

	try {
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.CHIP_CREATE_OUTPUT_DIR = outputDir;
		process.env.SPARK_BUILDER_HOME = builderHome;
		process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
		process.env.SPARK_BUILDER_REPO = tempDir;
		process.env.SPARK_DOMAIN_CHIP_LABS_ROOT = chipLabsRoot;
		process.env.SPARK_MISSION_CONTROL_DISABLED = '1';
		delete process.env.SPARK_MODEL_ROUTER;
		mkdirSync(path.join(tempDir, 'src', 'spark_intelligence'), { recursive: true });
		writeFileSync(path.join(tempDir, 'src', 'spark_intelligence', 'cli.py'), '');
		mkdirSync(builderHome, { recursive: true });
		mkdirSync(outputDir, { recursive: true });
		mkdirSync(chipLabsRoot, { recursive: true });
		writeFileSync(fakeBuilder, [
			'#!/usr/bin/env node',
			"const fs = require('node:fs');",
			`if (process.argv.includes('chips') && process.argv.includes('create')) fs.writeFileSync(${JSON.stringify(builderArgvPath)}, JSON.stringify(process.argv));`,
			"process.stdout.write(JSON.stringify({ ok: true, chip_key: 'domain-chip-payments-risk-domain-chip-for', chip_path: 'domain-chip-payments-risk-domain-chip-for', router_invokable: false, proof_artifacts: { schema_version: 'spark.chip_proof.v1' }, warnings: [] }));"
		].join('\n'));
		chmodSync(fakeBuilder, 0o755);

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, requestId: body?.requestId } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const indexModule: any = await import('../src/index');

		const createCtx = makeFakeCtx(8319079055, 8319079055, 101, replies);
		createCtx.message.text = 'create a payments risk domain chip for launch readiness';
		await indexModule.handleTextMessage(createCtx);

		assert.match(
			replies.join('\n'),
			/I can turn this into a private Domain Chip: domain-chip-payments-risk-domain-chip-for/i
		);
		assert.match(replies.join('\n'), /Reply "go"/);
		assert.doesNotMatch(replies.join('\n'), /names only/);
		assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'preview must not enqueue before follow-up');

		const yesCtx = makeFakeCtx(8319079055, 8319079055, 102, replies);
		yesCtx.message.text = 'yes';
		await indexModule.handleTextMessage(yesCtx);
		assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'bare yes must not dispatch pending domain chip');
		assert.match(replies[replies.length - 1] || '', /will not start the pending domain chip from a bare yes/i);

		const staleAuthorityCtx = makeFakeCtx(8319079055, 8319079055, 104, replies);
		staleAuthorityCtx.message.text = 'Suppose pending state says publish, but I say not now here; who has control?';
		await indexModule.handleTextMessage(staleAuthorityCtx);
		assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'stale authority question must not dispatch pending domain chip');
		assert.match(replies[replies.length - 1] || '', /Fresh "not now" wins/i);

		const goCtx = makeFakeCtx(8319079055, 8319079055, 105, replies);
		goCtx.message.text = 'go';
		await indexModule.handleTextMessage(goCtx);

		assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'pending go must stay on the canonical Builder lane');
		const builderArgs = JSON.parse(readFileSync(builderArgvPath, 'utf8')) as string[];
		assert.deepEqual(builderArgs.slice(2, 6), ['-m', 'spark_intelligence.cli', 'chips', 'create']);
		const governorArg = JSON.parse(String(builderArgs[builderArgs.indexOf('--governor-decision-json') + 1] || '{}'));
		assertBuilderChipCreateAuthority(governorArg);
		assert.match(replies.join('\n'), /Creating domain-chip-payments-risk-domain-chip-for privately with the recommended defaults/i);
		assert.match(replies.join('\n'), /Domain Chip created: domain-chip-payments-risk-domain-chip-for/i);

		console.log('ok - domain chip pending go dispatches with Harness authority');
	} finally {
		(axios as any).post = originalPost;
		(axios as any).get = originalGet;
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete (process.env as any)[key];
			else (process.env as any)[key] = value;
		}
		rmSync(tempDir, { recursive: true, force: true });
	}
}

run().catch((error) => {
	console.error('not ok - domain chip pending go dispatches with Harness authority');
	console.error(error);
	process.exit(1);
});
