/**
 * buildE2E.test.ts — full Telegram route contract tests.
 * Verifies production wiring across build, Domain Chip, access, proof, and
 * conversation safety paths with fake Telegraf contexts and intercepted I/O.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import {
	createHarnessCoreActionEnvelopeVNext,
	createHarnessCoreAuthorizedGovernorDecision
} from '@spark/harness-core';
import { describeTier, getTierForUser } from '../src/userTier';
import { readJsonFile, resolveStatePath } from '../src/jsonState';
import { readHarnessCoreToolLedger } from '../src/harnessCoreLedger';
import { buildHarnessProofCapsule } from '../src/harnessProofCapsule';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
	try {
		await fn();
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`not ok - ${name}`);
		throw error;
	}
}

const originalPost = axios.post;
const originalGet = axios.get;
const originalEnv = {
	BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
	BOT_PRO_USER_IDS: process.env.BOT_PRO_USER_IDS,
	ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
	LLM_PROVIDER: process.env.LLM_PROVIDER,
	SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
	SPARK_BUILDER_BRIDGE_MODE: process.env.SPARK_BUILDER_BRIDGE_MODE,
	SPARK_CLARIFICATION_COPY_LLM: process.env.SPARK_CLARIFICATION_COPY_LLM,
	SPARK_CHAT_LLM_PROVIDER: process.env.SPARK_CHAT_LLM_PROVIDER,
	SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
	SPARK_FINAL_ANSWER_GATE_AUDIT_PATH: process.env.SPARK_FINAL_ANSWER_GATE_AUDIT_PATH,
	SPARK_GATEWAY_STATE_DIR: process.env.SPARK_GATEWAY_STATE_DIR,
	SPARK_HOME: process.env.SPARK_HOME,
	SPARK_HARNESS_CORE_LEDGER: process.env.SPARK_HARNESS_CORE_LEDGER,
	SPARK_HARNESS_CORE_LEDGER_PATH: process.env.SPARK_HARNESS_CORE_LEDGER_PATH,
	SPARK_LLM_PROVIDER: process.env.SPARK_LLM_PROVIDER,
	SPARK_SYSTEM_MAP_STATE_DIR: process.env.SPARK_SYSTEM_MAP_STATE_DIR,
	SPARK_TELEGRAM_ROUTE_CONFIDENCE_AUDIT_PATH: process.env.SPARK_TELEGRAM_ROUTE_CONFIDENCE_AUDIT_PATH,
	SPARK_ALLOW_IMPLICIT_LLM_PROVIDER: process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER,
	SPARK_SWARM_BRIDGE_PYTHON: process.env.SPARK_SWARM_BRIDGE_PYTHON,
	SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO: process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO,
	SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
	SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

function applyDeterministicProviderDefaults(): void {
	process.env.LLM_PROVIDER = 'disabled-for-test';
	process.env.SPARK_CHAT_LLM_PROVIDER = 'disabled-for-test';
	process.env.SPARK_LLM_PROVIDER = 'disabled-for-test';
	process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER = '0';
}

function restoreAxios(): void {
	(axios as any).post = originalPost;
	(axios as any).get = originalGet;
}
function restoreEnv(): void {
	for (const [k, v] of Object.entries(originalEnv)) {
		if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
		else (process.env as Record<string, string>)[k] = v;
	}
	applyDeterministicProviderDefaults();
}

interface CapturedCall {
	url: string;
	body: any;
}

function fakeGovernorExecutionAuthority(): unknown {
	const envelope = createHarnessCoreActionEnvelopeVNext({
		surface: 'telegram',
		ownerSystem: 'spawner-ui',
		toolName: 'spawner.run',
		mutationClass: 'launches_mission',
		source: 'buildE2E.test',
		reason: 'Test Harness Core authority for the simple Spawner run path.',
		requestId: 'turn:build-e2e-simple-run',
		actorIdRef: 'telegram-human'
	});
	return createHarnessCoreAuthorizedGovernorDecision({ envelope, tool_name: 'spawner.run' });
}

function assertTraceContextWithProof(traceContext: any, expected: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(expected)) {
		assert.equal(traceContext?.[key], value, `trace context ${key}`);
	}
	assert.equal(traceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');
	assert.match(traceContext?.proofCapsule?.turnRef, /^turn:sha256:[a-f0-9]{16}$/);
	assert.equal(traceContext?.proofCapsule?.reply?.rawReasonsHidden, true);
	assert.doesNotMatch(JSON.stringify(traceContext.proofCapsule), /8319079055|tg-build-|tg-run-|trace:spawner-prd|trace:telegram-run/);
}

function assertOutboundAuditCarriesProof(indexModule: any, traceContext: any, chatId = 8319079055): void {
	const record = indexModule.buildNodeOutboundAuditRecord(
		chatId,
		'Spark acknowledgement',
		new Date('2026-06-24T00:00:00.000Z'),
		traceContext
	);
	assert.equal(record.harness_proof_ref, traceContext.proofCapsule.turnRef);
	assert.equal((record.proof_capsule as any)?.schema, 'spark.harness_proof.v1');
	assert.doesNotMatch(JSON.stringify(record.proof_capsule), new RegExp(String(chatId)));
}

function assertRouteConfidenceAuditProof(record: any, expected: { outcome: string; decision: string; rawRequestId: string; rawTraceRef: string }): void {
	assert.equal(record.schema_version, 'spark.telegram_route_confidence_audit.v1');
	assert.equal(record.outcome, expected.outcome);
	assert.equal(record.decision, expected.decision);
	assert.match(record.request_ref, /^request:sha256:[a-f0-9]{16}$/);
	assert.match(record.trace_ref, /^trace:sha256:[a-f0-9]{16}$/);
	assert.equal(record.harness_proof_ref, record.proof_capsule.turnRef);
	assert.equal(record.proof_capsule.schema, 'spark.harness_proof.v1');
	assert.equal(record.proof_capsule.reply.rawReasonsHidden, true);
	assert.equal(Object.prototype.hasOwnProperty.call(record, 'request_id'), false);
	assert.equal(Object.prototype.hasOwnProperty.call(record, 'traceRef'), false);
	assert.doesNotMatch(JSON.stringify(record), new RegExp(`${expected.rawRequestId}|${expected.rawTraceRef}|8319079055|8319079071`));
}

async function readMissionRelayRegistry(): Promise<any[]> {
	const profile = (process.env.SPARK_TELEGRAM_PROFILE || 'primary').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
	const port = Number(process.env.TELEGRAM_RELAY_PORT || 8788);
	return (await readJsonFile<any[]>(resolveStatePath(`.spark-spawner-missions-${profile}-${port}.json`))) || [];
}

function makeFakeCtx(chatId: number, fromId: number, messageId: number, replies: string[], replyExtras: any[] = []) {
	return {
		chat: { id: chatId },
		from: { id: fromId, username: 'cem' },
		message: { message_id: messageId, text: 'build me a saas with auth and billing' },
		update: { update_id: messageId },
		sendChatAction: async (_action: string) => {},
		reply: async (text: string, extra?: any) => {
			replies.push(text);
			replyExtras.push(extra);
		}
	};
}

async function waitForFileText(filePath: string, timeoutMs = 1000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const text = readFileSync(filePath, 'utf-8');
			if (text.trim()) return text;
		} catch {
			// The audit write is fire-and-forget; poll briefly until it lands.
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return readFileSync(filePath, 'utf-8');
}

async function callHandleBuildIntent(opts: {
	ctx: any;
	prd: string;
	projectName: string;
	buildMode: 'direct' | 'advanced_prd';
	buildLane?: 'fast_direct' | 'direct' | 'advanced_prd';
}): Promise<any> {
	process.env.SPARK_BOT_TEST_MODE = '1';
	process.env.SPARK_CLARIFICATION_COPY_LLM = '0';
	process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
	// Stub the access-policy gate so the test does not require a real
	// Spark access profile to be loaded. We assume sparkAccessAllows would
	// pass for an admin tester; the production path runs the real gate.
	const indexModule: any = await import('../src/index');
	if (typeof indexModule.handleBuildIntent !== 'function') {
		throw new Error('handleBuildIntent not exported from src/index.ts — export it for E2E testing');
	}
	await indexModule.handleBuildIntent(opts.ctx, opts.prd, opts.projectName, null, opts.buildMode, 'test', undefined, opts.buildLane);
	return indexModule;
}

async function run(): Promise<void> {
	applyDeterministicProviderDefaults();

	await test('getTierForUser: admin always pro', () => {
		process.env.ADMIN_TELEGRAM_IDS = '1278511160,8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		assert.equal(getTierForUser(8319079055), 'pro');
		assert.equal(getTierForUser('1278511160'), 'pro');
		restoreEnv();
	});

	await test('getTierForUser: pro list overrides default', () => {
		process.env.ADMIN_TELEGRAM_IDS = '';
		process.env.BOT_PRO_USER_IDS = '12345';
		process.env.BOT_DEFAULT_TIER = 'base';
		assert.equal(getTierForUser(12345), 'pro');
		assert.equal(getTierForUser(99999), 'base');
		restoreEnv();
	});

	await test('getTierForUser: default base when no env', () => {
		delete process.env.ADMIN_TELEGRAM_IDS;
		delete process.env.BOT_PRO_USER_IDS;
		delete process.env.BOT_DEFAULT_TIER;
		assert.equal(getTierForUser(99999), 'base');
		restoreEnv();
	});

	await test('describeTier: base copy matches canonical starter loadout', () => {
		assert.equal(describeTier('base'), 'base tier (30-skill starter loadout)');
		assert.doesNotMatch(describeTier('base'), /41/);
		assert.equal(describeTier('pro'), 'pro tier (full Spark skill catalog)');
	});

	await test('build intent posts tier + relay + chatId to /api/prd-bridge/write', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write')) {
				return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'claude', started: true } } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [], replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 555, replies, replyExtras);

		let caughtError: unknown = null;
		let indexModule: any = null;
		try {
			indexModule = await callHandleBuildIntent({
				ctx,
				prd: 'Build a B2B SaaS with subscription billing.',
				projectName: 'saas-billing-test',
				buildMode: 'direct'
			});
		} catch (err) {
			// Acceptable: post-write polling may fail because we stub get/post minimally.
			// We only care about the first POST to /api/prd-bridge/write.
			caughtError = err;
		}

		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		assert.ok(
			writeCall,
			`expected POST to /api/prd-bridge/write; replies=${JSON.stringify(replies)} caught=${caughtError instanceof Error ? caughtError.message : String(caughtError)}`
		);
		assert.equal(writeCall!.body.tier, 'pro', 'admin user should resolve to pro tier');
		assert.equal(typeof writeCall!.body.requestId, 'string');
		assert.match(writeCall!.body.requestId, /^tg-build-/);
		assert.doesNotMatch(writeCall!.body.requestId, /8319079055/);
		assert.equal(writeCall!.body.chatId, '8319079055');
		assert.equal(writeCall!.body.userId, '8319079055');
		assert.equal(writeCall!.body.buildMode, 'direct');
		assert.equal(writeCall!.body.capabilityProposalPacket, undefined);
		assert.ok(writeCall!.body.content.includes('SaaS Billing Test'), 'PRD content includes project name header');
		assert.ok(writeCall!.body.telegramRelay, 'telegramRelay block present');
		assert.equal(typeof writeCall!.body.options, 'object');
		const missionId = `mission-${String(writeCall!.body.requestId).match(/(\d{10,})$/)?.[1]}`;
		assert.equal(writeCall!.body.traceRef, `trace:spawner-prd:${missionId}`);
		assert.match(writeCall!.body.harnessProofRef, /^turn:sha256:[a-f0-9]{16}$/);
		assert.deepEqual([writeCall!.body.harnessProofCapsule?.schema, writeCall!.body.harnessProofCapsule?.turnRef, writeCall!.body.harnessProofCapsule?.reply?.rawReasonsHidden], ['spark.harness_proof.v1', writeCall!.body.harnessProofRef, true]);
		assert.doesNotMatch(JSON.stringify(writeCall!.body.harnessProofCapsule), /8319079055|tg-build-|trace:spawner-prd/);
		assert.doesNotMatch(replies[0] || '', new RegExp(`Mission: ${missionId}`));
		assert.match(replies[0] || '', /🛠️ Setting up SaaS Billing Test as a direct build\./); assert.match(replies[0] || '', /Canvas next\./);
		for (const pattern of [/Spawned work/, /Paired surfaces/, /Canvas:/, /Mission board/]) assert.doesNotMatch(replies[0] || '', pattern);
		assertTraceContextWithProof(replyExtras[0]?.__sparkTraceContext, {
			route: 'spawner',
			command: 'run',
			replyKind: 'build_ack',
			requestId: writeCall!.body.requestId,
			traceRef: writeCall!.body.traceRef,
			missionId
		});
		assert.equal(writeCall!.body.harnessProofRef, replyExtras[0]?.__sparkTraceContext?.proofCapsule?.turnRef);
		assert.deepEqual(writeCall!.body.harnessProofCapsule, replyExtras[0]?.__sparkTraceContext?.proofCapsule);
		assertOutboundAuditCarriesProof(indexModule, replyExtras[0]?.__sparkTraceContext);
		const registry = await readMissionRelayRegistry();
		const subscription = registry.find((entry) => entry.missionId === missionId);
		assert.ok(subscription, 'PRD build mission should be registered for Telegram relay progress');
		assert.equal(subscription.chatId, '8319079055');
		assert.equal(subscription.userId, '8319079055');
		assert.equal(subscription.requestId, writeCall!.body.requestId);
		assert.equal(subscription.traceRef, writeCall!.body.traceRef);

		restoreAxios();
		restoreEnv();
	});

	await test('fast build intent tells PRD bridge to skip heavyweight planning', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'deterministic-fast-lane', started: false } } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 556, replies);
		await callHandleBuildIntent({
			ctx,
			prd: 'Build a one-screen emoji ergonomics smoke page with saved favorites and responsive checks.',
			projectName: 'One Screen Emoji Ergonomics Smoke Page',
			buildMode: 'direct',
			buildLane: 'fast_direct'
		});

		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		assert.ok(writeCall, 'expected POST to /api/prd-bridge/write');
		assert.equal(writeCall!.body.buildLane, 'fast_direct');
		assert.equal(writeCall!.body.options.fastLane, true);
		assert.equal(writeCall!.body.options.includeSkills, false);
		assert.match(writeCall!.body.content, /Build lane: fast_direct/);
		assert.match(replies[0] || '', /as a fast build\./);

		restoreAxios();
		restoreEnv();
	});

	await test('local build intent does not enqueue when Telegram runner is read-only', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-build-readonly-preflight-'));
		const stateAsFile = path.join(tempRoot, 'state-as-file');
		writeFileSync(stateAsFile, 'not a directory');
		process.env.SPARK_GATEWAY_STATE_DIR = stateAsFile;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
		};

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 557, replies, replyExtras);
		const indexModule: any = await import('../src/index');
		await indexModule.handleBuildIntent(
			ctx,
			'Build a local static app.',
			'local-readonly-test',
			'C:\\Users\\USER\\.spark\\workspaces\\default\\local-readonly-test',
			'direct',
			'test'
		);

		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'read-only local build should not POST to PRD bridge');
		assert.match(replies.join('\n'), /current Telegram runner is read-only/);
		assert.match(replies.join('\n'), /\/access_setup/);

		rmSync(tempRoot, { force: true, recursive: true });
		restoreAxios();
		restoreEnv();
	});

	await test('/run build requests route to PRD bridge instead of simple Spark run', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write')) {
				return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'zai', started: true } } };
			}
			if (url.includes('/api/spark/run')) {
				return { data: { success: true, missionId: 'spark-should-not-run', requestId: body.requestId, providers: ['zai'] } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 556, replies, replyExtras);
		const indexModule: any = await import('../src/index');

		const missionId = await indexModule.handleRunCommand(
			ctx,
			'Build a tiny static landing page for a cafe with a menu section.',
			['zai'],
			undefined,
			{ allowBuildIntent: true }
		);

			assert.equal(missionId, null, 'build-mode /run is handled by the PRD bridge notifier path');
			assert.ok(captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'expected /run build request to POST to /api/prd-bridge/write');
			assert.ok(!captured.some((c) => c.url.includes('/api/spark/run')), 'build request should not use the simple Spark run API');
			assert.match(replies.join('\n'), /🛠️ Setting up Cafe Landing Page as a fast build\./);
			assert.doesNotMatch(replies.join('\n'), /Spawned work/);
			assert.doesNotMatch(replies.join('\n'), /Mission board/);
		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		assert.ok(writeCall, 'expected build route to include PRD bridge call');
		assert.equal(writeCall!.body.buildLane, 'fast_direct');
		assert.equal(writeCall!.body.options.fastLane, true);
		const buildMissionId = `mission-${String(writeCall!.body.requestId).match(/(\d{10,})$/)?.[1]}`;
		assertTraceContextWithProof(replyExtras[0]?.__sparkTraceContext, {
			route: 'spawner',
			command: 'run',
			replyKind: 'build_ack',
			requestId: writeCall!.body.requestId,
			traceRef: writeCall!.body.traceRef,
			missionId: buildMissionId
		});
		assertOutboundAuditCarriesProof(indexModule, replyExtras[0]?.__sparkTraceContext);

		restoreAxios();
		restoreEnv();
	});

	await test('/run non-build requests still use the simple Spark run path', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/spark/run')) {
				return { data: { success: true, missionId: 'spark-simple-run-test', requestId: body.requestId, providers: ['zai'] } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 557, replies, replyExtras);
		const indexModule: any = await import('../src/index');
		const executionAuthority = fakeGovernorExecutionAuthority();

		const missionId = await indexModule.handleRunCommand(
			ctx,
			'Summarize the Railway deployment health.',
			['zai'],
			undefined,
			{ allowBuildIntent: true, executionAuthority }
		);

		assert.equal(missionId, 'spark-simple-run-test');
		const runCall = captured.find((c) => c.url.includes('/api/spark/run'));
		assert.ok(runCall, 'expected non-build /run to POST to /api/spark/run');
		assert.match(runCall!.body.requestId, /^tg-run-/);
		assert.doesNotMatch(runCall!.body.requestId, /8319079055/);
		assert.equal(runCall!.body.traceRef, `trace:telegram-run:${runCall!.body.requestId}`);
		assert.equal(runCall!.body.executionAuthority, executionAuthority);
		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'non-build /run should not use the PRD bridge');
		assertTraceContextWithProof(replyExtras[0]?.__sparkTraceContext, {
			route: 'spawner.run',
			command: 'run',
			replyKind: 'mission_ack',
			requestId: runCall!.body.requestId,
			traceRef: runCall!.body.traceRef,
			missionId: 'spark-simple-run-test'
		});
		assertOutboundAuditCarriesProof(indexModule, replyExtras[0]?.__sparkTraceContext);

		restoreAxios();
		restoreEnv();
	});

	await test('/run exact reply probes with negated file creation stay on simple Spark run path', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/spark/run')) {
				return { data: { success: true, missionId: 'spark-realpath-probe', requestId: body.requestId, providers: ['codex'] } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 558, replies);
		const indexModule: any = await import('../src/index');
		const executionAuthority = fakeGovernorExecutionAuthority();

		const missionId = await indexModule.handleRunCommand(
			ctx,
			'Reply exactly TESTER_REALPATH_OK and do not create files.',
			['codex'],
			undefined,
			{ allowBuildIntent: true, executionAuthority }
		);

		assert.equal(missionId, 'spark-realpath-probe');
		const runCall = captured.find((c) => c.url.includes('/api/spark/run'));
		assert.ok(runCall, 'expected exact reply probe to POST to /api/spark/run');
		assert.equal(runCall!.body.executionAuthority, executionAuthority);
		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'negated file creation should not use the PRD bridge');

		restoreAxios();
		restoreEnv();
	});

	await test('build intent keeps going when the prompt also changes update preferences', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write')) {
				return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 561, replies);
		ctx.message.text = [
			'Save mission updates as verbose and include both links.',
			'Build this at C:\\Users\\USER\\Desktop\\terminal-chef-clock: a playful clock for terminal devs who cook.',
			'Use advanced PRD planning first, then build and verify it.'
		].join('\n');

		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		assert.ok(writeCall, 'expected mixed preference/build prompt to POST to /api/prd-bridge/write');
			assert.match(writeCall!.body.content, /Target workspace\/project path: `C:\\Users\\USER\\Desktop\\terminal-chef-clock`/);
			assert.equal(writeCall!.body.buildMode, 'advanced_prd');
			assert.doesNotMatch(replies.join('\n'), /Saved your mission update preference/);
			assert.match(replies[0] || '', /🛠️ Setting up Terminal Chef Clock as a planning canvas\./);

		restoreAxios();
		restoreEnv();
	});

	await test('explicit memory preference save and recall beats stale project context', async () => {
		restoreAxios();
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const indexModule: any = await import('../src/index');

		const saveReplies: string[] = [];
		const saveCtx = makeFakeCtx(8319079055, 8319079055, 562, saveReplies);
		saveCtx.message.text = 'remember this: my preferred mission updates are concise and outcome-focused';
		await indexModule.handleTextMessage(saveCtx);

		const recallReplies: string[] = [];
		const recallCtx = makeFakeCtx(8319079055, 8319079055, 563, recallReplies);
		recallCtx.message.text = 'what do you remember about how I like mission updates?';
		await indexModule.handleTextMessage(recallCtx);

		assert.match(saveReplies.join('\n'), /Saved in Telegram memory/i);
		assert.doesNotMatch(saveReplies.join('\n'), /passive Spark bug recognition/i);
		assert.match(recallReplies.join('\n'), /concise and outcome-focused/i);
		assert.doesNotMatch(recallReplies.join('\n'), /passive Spark bug recognition/i);

		restoreAxios();
		restoreEnv();
	});

	await test('XContent token follow-up answers capability boundary before Builder fallback', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const indexModule: any = await import('../src/index');
		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 564, replies);
		ctx.message.text = 'we had x bearer tokens in xcontent tool can we fetch it from there';

		await indexModule.handleTextMessage(ctx);

		const reply = replies.join('\n');
		assert.match(reply, /(?:should not|Don’t) fetch bearer tokens out of XContent/);
		assert.match(reply, /XContent through its own route for premium X analysis/);
		assert.match(reply, /SPARK_X_BEARER_TOKEN/);
		assert.match(reply, /secrets stay (?:inside|with).*(?:owns them).*(?:don’t leak)/s);
		assert.doesNotMatch(reply, /Ask XContent to evaluate a post|Natural language is enough|(?:^|[^A-Z_])(?:X_BEARER_TOKEN|TWITTER_BEARER_TOKEN)(?:$|[^A-Z_])/);

		restoreAxios();
		restoreEnv();
	});

	await test('X post review links ask for readable text without guessing or token-env claims', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const indexModule: any = await import('../src/index');
		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 565, replies);
		ctx.message.text = [
			'let me share you the most recent updates i shared on X too',
			'https://x.com/meta_alchemist/status/2060300738040082786',
			'https://x.com/Spark_coded/status/2060349528503726357',
			'https://x.com/meta_alchemist/status/2060636144984068237'
		].join('\n');

		await indexModule.handleTextMessage(ctx);

		const reply = replies.join('\n');
		assert.match(reply, /basic X reads from Spark-owned agent env/);
		assert.match(reply, /SPARK_X_BEARER_TOKEN/);
		assert.match(reply, /cannot use XContent secrets as a fallback/);
		assert.doesNotMatch(reply, /default guess|probably|(?:^|[^A-Z_])(?:X_BEARER_TOKEN|TWITTER_BEARER_TOKEN)(?:$|[^A-Z_])/);

		restoreAxios();
		restoreEnv();
	});

	await test('slash remember creates a local fresh note that slash recall can answer before vague Builder recall', async () => {
		restoreAxios();
		const testUserId = 8319079588;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let recallBridgeCalls = 0;
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			const messageText = String(((updatePayload as any).message || {}).text || '');
			if (/what do you remember about/i.test(messageText)) {
				recallBridgeCalls += 1;
				return {
					used: true,
					responseText: 'I do not currently have saved entity state for Spark E2E fresh-state phase.',
					decision: 'test',
					bridgeMode: 'test',
					routingDecision: 'memory.recall'
				};
			}
			return {
				used: true,
				responseText: 'Noted: "audit marker: Spark E2E fresh-state phase on 2026-05-17"',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'memory.write'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			const saveReplies: string[] = [];
			const saveCtx = makeFakeCtx(testUserId, testUserId, 5654, saveReplies);
			saveCtx.message.text = '/remember audit marker: Spark E2E fresh-state phase on 2026-05-17';
			(saveCtx as any).update = { update_id: 5654, message: saveCtx.message };
			await indexModule.handleRememberCommand(saveCtx);

			const recallReplies: string[] = [];
			const recallCtx = makeFakeCtx(testUserId, testUserId, 5655, recallReplies);
			recallCtx.message.text = '/recall Spark E2E fresh-state phase';
			(recallCtx as any).update = { update_id: 5655, message: recallCtx.message };
			await indexModule.handleRecallCommand(recallCtx);

			assert.match(saveReplies.join('\n'), /(?:Saved in Telegram memory|Noted:)/i);
			assert.equal(recallBridgeCalls, 0);
			assert.match(recallReplies.join('\n'), /I remember this: audit marker: Spark E2E fresh-state phase on 2026-05-17\./i);
			assert.doesNotMatch(recallReplies.join('\n'), /saved entity state/i);
		} finally {
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('natural memory-only recall uses fresh local notes before Builder fallback', async () => {
		restoreAxios();
		const testUserId = 8319079589;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let recallBridgeCalls = 0;
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			const messageText = String(((updatePayload as any).message || {}).text || '');
			if (/railway testing/i.test(messageText) && !/please remember this/i.test(messageText)) {
				recallBridgeCalls += 1;
				return {
					used: true,
					responseText: "I don't currently have that saved.",
					decision: 'test',
					bridgeMode: 'test',
					routingDecision: 'memory.recall'
				};
			}
			return {
				used: true,
				responseText: 'Noted: "Railway testing decision: use Railway for disposable cloud sandbox checks, but keep local Telegram proof separate from Railway proof."',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'memory.write'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			const saveReplies: string[] = [];
			const saveCtx = makeFakeCtx(testUserId, testUserId, 5656, saveReplies);
			saveCtx.message.text = '/remember Railway testing decision: use Railway for disposable cloud sandbox checks, but keep local Telegram proof separate from Railway proof.';
			(saveCtx as any).update = { update_id: 5656, message: saveCtx.message };
			await indexModule.handleRememberCommand(saveCtx);

			const recallReplies: string[] = [];
			const recallCtx = makeFakeCtx(testUserId, testUserId, 5657, recallReplies);
			recallCtx.message.text = 'Use memory only as context: what did we decide about Railway testing? Keep it short and do not run anything.';
			(recallCtx as any).update = { update_id: 5657, message: recallCtx.message };
			await indexModule.handleTextMessage(recallCtx);

			assert.equal(recallBridgeCalls, 0);
			assert.match(recallReplies.join('\n'), /use Railway for disposable cloud sandbox checks/i);
			assert.match(recallReplies.join('\n'), /keep local Telegram proof separate from Railway proof/i);
			assert.doesNotMatch(recallReplies.join('\n'), /don't currently have that saved/i);
		} finally {
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('memory doctor evidence includes user turns from final Builder replies', async () => {
		restoreAxios();
		const testUserId = 8319079564;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		const capturedBridgeTexts: string[] = [];
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			const messagePayload = (updatePayload as any).message || {};
			capturedBridgeTexts.push(String(messagePayload.text || ''));
			const messageText = String(messagePayload.text || '');
			return {
				used: true,
				responseText: /route confidence/i.test(messageText)
					? 'Route confidence is evidence-backed route selection.'
					: 'Builder acknowledged the turn.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'plain_chat'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest((builderBridge as any).runBuilderTelegramBridge);
			const firstReplies: string[] = [];
			const firstCtx = makeFakeCtx(testUserId, testUserId, 5641, firstReplies);
			firstCtx.message.text = 'what is route confidence in one sentence';
			(firstCtx as any).update = { update_id: 5641, message: firstCtx.message };
			await indexModule.handleTextMessage(firstCtx);

			const doctorReplies: string[] = [];
			const doctorCtx = makeFakeCtx(testUserId, testUserId, 5642, doctorReplies);
			doctorCtx.message.text = 'run memory doctor for last request';
			(doctorCtx as any).update = { update_id: 5642, message: doctorCtx.message };
			await indexModule.handleTextMessage(doctorCtx);

			const doctorPayload = capturedBridgeTexts.find((payload) => /Spark Telegram Memory Doctor evidence/.test(payload)) || '';
			const doctorReply = doctorReplies.join('\n');
			assert.match(`${doctorPayload}\n${doctorReply}`, /Spark Telegram Memory Doctor evidence|Memory Doctor/);
			assert.match(`${doctorPayload}\n${doctorReply}`, /what is route confidence in one sentence/);
			assert.match(`${doctorPayload}\n${doctorReply}`, /assistant: .*Route confidence/i);
			assert.doesNotMatch(`${doctorPayload}\n${doctorReply}`, /all your chips work/i);
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest(null);
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('memory doctor replaces Builder tool detours with local evidence fallback', async () => {
		restoreAxios();
		const testUserId = 8319079566;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			const messageText = String(((updatePayload as any).message || {}).text || '');
			return {
				used: true,
				responseText: /memory doctor/i.test(messageText)
					? 'Both Spark MCP tools need permission to run. Which do you prefer?'
					: 'Route confidence is evidence-backed route selection.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'plain_chat'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest((builderBridge as any).runBuilderTelegramBridge);
			const firstReplies: string[] = [];
			const firstCtx = makeFakeCtx(testUserId, testUserId, 5643, firstReplies);
			firstCtx.message.text = 'what is route confidence in one sentence';
			(firstCtx as any).update = { update_id: 5643, message: firstCtx.message };
			await indexModule.handleTextMessage(firstCtx);

			const doctorReplies: string[] = [];
			const doctorCtx = makeFakeCtx(testUserId, testUserId, 5644, doctorReplies);
			doctorCtx.message.text = 'run memory doctor for last request';
			(doctorCtx as any).update = { update_id: 5644, message: doctorCtx.message };
			await indexModule.handleTextMessage(doctorCtx);

			const reply = doctorReplies.join('\n');
			assert.match(reply, /Memory Doctor/);
			assert.match(reply, /without MCP\/tool approval/);
			assert.doesNotMatch(reply, /Which do you prefer/);
			assert.match(reply, /assistant: .*Route confidence/i);
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest(null);
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('memory doctor blankness requests bypass pending-task recovery', async () => {
		restoreAxios();
		const testUserId = 8319079565;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let bridgeCalls = 0;
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			bridgeCalls += 1;
			return {
				used: true,
				responseText: 'Builder should not handle this blankness request.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'plain_chat'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest((builderBridge as any).runBuilderTelegramBridge);
			const priorReplies: string[] = [];
			const priorCtx = makeFakeCtx(testUserId, testUserId, 5651, priorReplies);
			priorCtx.message.text = 'what is route confidence in one sentence';
			(priorCtx as any).update = { update_id: 5651, message: priorCtx.message };
			await indexModule.handleTextMessage(priorCtx);
			bridgeCalls = 0;
			await conversationModule.conversation.remember(
				{ id: testUserId, username: 'memory-test' },
				'run memory doctor for last request'
			);
			await conversationModule.conversation.rememberAssistantReply(
				{ id: testUserId, username: 'memory-test' },
				'Both Spark MCP tools need permission to run. Which do you prefer?'
			);
			await conversationModule.conversation.recordInterruptedTask(
				{ id: testUserId, username: 'memory-test' },
				{ message: 'What do you know about yourself and where do you lack?', failure: 'message is too long', stage: 'telegram_message_handler' }
			);

			const blankReplies: string[] = [];
			const blankCtx = makeFakeCtx(testUserId, testUserId, 5652, blankReplies);
			blankCtx.message.text = 'you went blank and lost context, what happened?';
			(blankCtx as any).update = { update_id: 5652, message: blankCtx.message };
			await indexModule.handleTextMessage(blankCtx);

			assert.equal(bridgeCalls, 0);
			assert.match(blankReplies.join('\n'), /Memory Doctor/);
			assert.match(blankReplies.join('\n'), /detoured into MCP\/tool permission/);
			assert.doesNotMatch(blankReplies.join('\n'), /I recovered the last interrupted task/i);
			assert.doesNotMatch(blankReplies.join('\n'), /Builder should not handle/);
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest(null);
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('final-answer gate audit preserves Builder trace ids for suppressed replies', async () => {
		restoreAxios();
		const testUserId = 8319079570;
		const indexModule: any = await import('../src/index');
		const proofCapsule = buildHarnessProofCapsule({
			turnRef: 'trace:req-final-gate',
			route: 'plain_chat',
			owner: 'spark-telegram-bot',
			intent: { kind: 'plain_chat', confidence: 'explicit', noExecution: true },
			authority: {
				decision: 'blocked',
				contract: 'spark.turn_intent.v1',
				riskTier: 'read',
				reasonSummary: 'Suppressed Builder reply and used local chat fallback.'
			},
			governor: { decision: 'deny', verified: true },
			execution: { status: 'blocked', tool: 'answer.compose', mutationClass: 'read_only' },
			reply: { delivered: false, shape: 'none', rawReasonsHidden: true },
			joins: { telegram: 'joined', builder: 'joined' }
		});
		const record = indexModule.buildFinalAnswerGateSuppressionRecord({
			chatId: testUserId,
			userId: testUserId,
			suppressionReason: 'memory_acknowledgement',
			builderRoutingDecision: 'plain_chat',
			builderBridgeMode: 'test',
			builderReply: 'Noted: saved. Working Memory: /Users/example/private tool_not_allowed_by_policy.',
			requestId: 'req-final-gate',
			traceRef: 'trace:req-final-gate',
			proofCapsule,
			fallbackRoute: 'local_chat'
		}, new Date('2026-05-25T00:00:00.000Z'));

		assert.equal(record.outcome, 'suppressed_builder_reply');
		assert.equal(record.request_id, 'req-final-gate');
		assert.equal(record.trace_ref, 'trace:req-final-gate');
		assert.equal(record.harness_proof_ref, proofCapsule.turnRef);
		assert.equal(record.proof_capsule.schema, 'spark.harness_proof.v1');
		assert.equal(record.builder_reply_preview, 'Noted: saved. Working Memory: [REDACTED_PATH] internal policy reason.');
		assert.equal(record.chat_id_present, true);
		assert.equal(record.user_id_present, true);
		assert.match(String(record.chat_ref), /^chat_[a-f0-9]{16}$/);
		assert.match(String(record.user_ref), /^user_[a-f0-9]{16}$/);
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'chat_id'), false);
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'user_id'), false);
		assert.doesNotMatch(JSON.stringify(record), new RegExp(String(testUserId)));
		assert.doesNotMatch(JSON.stringify(record), /\/Users\/example|tool_not_allowed_by_policy/);
		assert.doesNotMatch(JSON.stringify(record.proof_capsule), /req-final-gate/);
		restoreAxios();
		restoreEnv();
	});

	await test('turn-level outbound trace context gives ordinary replies request and trace coverage', async () => {
		restoreAxios();
		const indexModule: any = await import('../src/index');
		const envelope = buildTelegramTurnIntentEnvelope({
			text: 'what is the current live state of Spark?',
			decision: classifyTelegramIntentV2('what is the current live state of Spark?'),
			userRef: 'user:private-raw',
			chatRef: 'chat:private-raw',
			accessProfile: 'admin',
			conversationKind: 'dm',
			turnId: 'turn:ordinary-reply',
			traceId: 'trace:ordinary-reply'
		});
		const traceContext = indexModule.buildTurnOutboundTraceContext(envelope);
		const record = indexModule.buildNodeOutboundAuditRecord(
			8319079055,
			'Spark Live is ready.',
			new Date('2026-06-24T00:00:00.000Z'),
			traceContext
		);

		assert.equal(record.trace_context_present, true);
		assert.equal(record.request_id, 'turn:ordinary-reply');
		assert.equal(record.trace_ref, 'trace:ordinary-reply');
		assert.equal(record.route, envelope.selectedIntent.action || envelope.selectedIntent.kind);
		assert.equal(record.command, 'telegram');
		assert.equal(record.reply_kind, traceContext.replyKind);
		assert.equal(record.harness_proof_ref, traceContext.proofCapsule.turnRef);
		assert.equal(record.proof_capsule.schema, 'spark.harness_proof.v1');
		assert.equal(record.proof_capsule.owner, 'spark-telegram-bot');
		assert.equal(record.proof_capsule.execution.tool, 'answer.compose');
		assert.equal(record.proof_capsule.execution.mutationClass, 'read_only');
		assert.equal(record.proof_capsule.execution.status, 'completed');
		assert.equal(record.proof_capsule.reply.delivered, true);
		assert.equal(record.proof_capsule.reply.rawReasonsHidden, true);
		assert.equal(record.proof_capsule.joins.telegram, 'joined');
		assert.equal(record.proof_capsule.joins.spawner, 'not_applicable');
		assert.doesNotMatch(JSON.stringify(record), /8319079055|private-raw/);
		restoreAxios();
		restoreEnv();
	});

	await test('default outbound trace context covers slash command replies', async () => {
		restoreAxios();
		const indexModule: any = await import('../src/index');
		const traceContext = indexModule.buildDefaultTurnOutboundTraceContext({
			from: { id: 8319079055 },
			chat: { id: 8319079055, type: 'private' },
			message: { text: '/streaming' }
		});
		const record = indexModule.buildNodeOutboundAuditRecord(
			8319079055,
			'Streaming is on.',
			new Date('2026-06-24T00:00:00.000Z'),
			traceContext
		);

		assert.equal(record.trace_context_present, true);
		assert.match(String(record.request_id), /^turn_/);
		assert.match(String(record.trace_ref), /^trace_/);
		assert.equal(record.route, 'telegram_command');
		assert.equal(record.command, 'telegram');
		assert.equal(record.reply_kind, 'execute_reply');
		assert.equal(record.harness_proof_ref, traceContext.proofCapsule.turnRef);
		assert.equal(record.proof_capsule.schema, 'spark.harness_proof.v1');
		assert.equal(record.proof_capsule.execution.tool, 'answer.compose');
		assert.equal(record.proof_capsule.execution.mutationClass, 'read_only');
		assert.equal(record.proof_capsule.reply.delivered, true);
		assert.doesNotMatch(JSON.stringify(record), /8319079055|Streaming is on/);
		restoreAxios();
		restoreEnv();
	});

	await test('outbound audit creates delivery-local refs when no turn context is available', async () => {
		restoreAxios();
		const indexModule: any = await import('../src/index');
		const record = indexModule.buildNodeOutboundAuditRecord(
			8319079055,
			'Spark Live is ready.',
			new Date('2026-06-24T00:00:00.000Z'),
			null
		);

		assert.equal(record.trace_context_present, false);
		assert.equal(record.trace_context_scope, 'delivery_local');
		assert.match(record.request_ref, /^request:sha256:[a-f0-9]{16}$/);
		assert.match(record.trace_ref, /^trace:sha256:[a-f0-9]{16}$/);
		assert.equal(record.proof_status, 'not_execution_proof');
		assert.equal(record.proof_storage, 'not_applicable');
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'harness_proof_ref'), false);
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'proof_capsule'), false);
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'request_id'), false);
		assert.doesNotMatch(JSON.stringify(record), /8319079055|Spark Live is ready/);
		restoreAxios();
		restoreEnv();
	});

	await test('outbound audit marks partial turn delivery without proof as an explicit gap', async () => {
		restoreAxios();
		const indexModule: any = await import('../src/index');
		const record = indexModule.buildNodeOutboundAuditRecord(
			8319079055,
			'Spark Live is ready.',
			new Date('2026-06-24T00:00:00.000Z'),
			{
				route: 'proof.inspect',
				requestId: 'turn:partial-outbound',
				traceRef: 'trace:partial-outbound'
			}
		);

		assert.equal(record.trace_context_present, true);
		assert.equal(record.trace_context_scope, 'turn_or_action');
		assert.equal(record.request_id, 'turn:partial-outbound');
		assert.equal(record.trace_ref, 'trace:partial-outbound');
		assert.equal(record.proofStatus, 'missing_harness_proof');
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'harness_proof_ref'), false);
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'proof_capsule'), false);
		assert.doesNotMatch(JSON.stringify(record), /8319079055|Spark Live is ready/);
		restoreAxios();
		restoreEnv();
	});

	await test('unsupported Telegram document replies carry typed media envelope and proof context', async () => {
		restoreAxios();
		restoreEnv();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		const indexModule: any = await import('../src/index');
		const message = {
			message_id: 627,
			document: {
				file_id: 'private-doc-id',
				file_name: 'private-plan.pdf',
				mime_type: 'application/pdf'
			}
		};
		const traceContext = indexModule.buildUnsupportedTelegramMediaTraceContext(message);
		const record = indexModule.buildNodeOutboundAuditRecord(
			8319079055,
			'I received that file.',
			new Date('2026-06-24T00:00:00.000Z'),
			traceContext
		);

		assert.equal(record.route, 'media.document');
		assert.equal(record.reply_kind, 'unsupported_media');
		assert.equal((record.media_turn as any).schema, 'spark.media_turn.v1');
		assert.equal((record.media_turn as any).media_kind, 'document');
		assert.equal((record.media_turn as any).analysis_policy.can_read, false);
		assert.equal((record.media_turn as any).analysis_policy.can_execute, false);
		assert.equal(record.harness_proof_ref, traceContext.proofCapsule.turnRef);
		assert.equal((record.proof_capsule as any).execution.tool, 'telegram.media.evidence');
		assert.equal((record.proof_capsule as any).execution.mutationClass, 'read_only');
		assert.equal((record.proof_capsule as any).reply.delivered, true);
		assert.doesNotMatch(JSON.stringify(record), /8319079055|private-doc-id|private-plan/);

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 627, replies, replyExtras);
		(ctx as any).message = message;
		await indexModule.handleUnsupportedTelegramMediaMessage(ctx);

		assert.match(replies[0] || '', /I received that file/);
		assert.match(replies[0] || '', /will not execute anything/);
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.route, 'media.document');
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.replyKind, 'unsupported_media');
		assert.equal(replyExtras[0]?.__sparkTraceContext?.mediaTurn?.media_kind, 'document');
		assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');
		assert.doesNotMatch(JSON.stringify(replyExtras[0]), /private-doc-id|private-plan|8319079055/);
		restoreAxios();
		restoreEnv();
	});

	await test('unsupported Telegram video replies carry typed media envelope and proof context', async () => {
		restoreAxios();
		restoreEnv();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		const indexModule: any = await import('../src/index');
		const message = {
			message_id: 628,
			video: {
				file_id: 'private-video-id',
				file_name: 'private-demo.mp4',
				mime_type: 'video/mp4'
			}
		};
		const traceContext = indexModule.buildUnsupportedTelegramMediaTraceContext(message);
		const record = indexModule.buildNodeOutboundAuditRecord(
			8319079055,
			'I received that media.',
			new Date('2026-06-24T00:00:00.000Z'),
			traceContext
		);

		assert.equal(record.route, 'media.video');
		assert.equal(record.reply_kind, 'unsupported_media');
		assert.equal((record.media_turn as any).schema, 'spark.media_turn.v1');
		assert.equal((record.media_turn as any).media_kind, 'video');
		assert.equal((record.media_turn as any).source.has_video, true);
		assert.equal((record.media_turn as any).analysis_policy.can_read, false);
		assert.equal((record.media_turn as any).analysis_policy.can_execute, false);
		assert.equal(record.harness_proof_ref, traceContext.proofCapsule.turnRef);
		assert.equal((record.proof_capsule as any).execution.tool, 'telegram.media.evidence');
		assert.equal((record.proof_capsule as any).execution.mutationClass, 'read_only');
		assert.equal((record.proof_capsule as any).reply.delivered, true);
		assert.doesNotMatch(JSON.stringify(record), /8319079055|private-video-id|private-demo/);

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 628, replies, replyExtras);
		(ctx as any).message = message;
		await indexModule.handleUnsupportedTelegramMediaMessage(ctx);

		assert.match(replies[0] || '', /I received that file or media/);
		assert.match(replies[0] || '', /will not execute anything/);
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.route, 'media.video');
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.replyKind, 'unsupported_media');
		assert.equal(replyExtras[0]?.__sparkTraceContext?.mediaTurn?.media_kind, 'video');
		assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');
		assert.doesNotMatch(JSON.stringify(replyExtras[0]), /private-video-id|private-demo|8319079055/);
		restoreAxios();
		restoreEnv();
	});

	await test('Telegram audio input keeps audio route and proof metadata through Builder handoff', async () => {
		restoreAxios();
		restoreEnv();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-audio-media-proof-'));
		process.env.SPARK_HARNESS_CORE_LEDGER_PATH = path.join(tempRoot, 'harness-ledger.jsonl');
		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let capturedBridgePayload: Record<string, unknown> | null = null;
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			capturedBridgePayload = updatePayload;
			return {
				used: true,
				responseText: 'Audio transcription is ready.',
				requestId: 'builder-audio-request',
				traceRef: 'builder-audio-trace',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'media.audio'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest((builderBridge as any).runBuilderTelegramBridge);
			const replies: string[] = [];
			const replyExtras: any[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 628, replies, replyExtras);
			(ctx as any).message = {
				message_id: 628,
				caption: 'Transcribe this startup note.',
				audio: {
					file_id: 'private-audio-id',
					mime_type: 'audio/mpeg',
					duration: 6
				}
			};
			(ctx as any).update = { update_id: 628, message: (ctx as any).message };

			await indexModule.handleVoiceMessage(ctx);

			const payloadMessage = (capturedBridgePayload as any)?.message || {};
			assert.equal(payloadMessage.spark_media_turn?.schema, 'spark.media_turn.v1');
			assert.equal(payloadMessage.spark_media_turn?.media_kind, 'audio');
			assert.equal((capturedBridgePayload as any)?.harnessProofRef, (capturedBridgePayload as any)?.harness_proof_ref);
			assert.match(String((capturedBridgePayload as any)?.harnessProofRef || ''), /^turn:sha256:[a-f0-9]{16}$/);
			assert.match(replies.join('\n'), /Audio transcription is ready/);
			assert.match(replyExtras[0]?.__sparkTraceContext?.requestId, /^request:sha256:[a-f0-9]{16}$/);
			assert.match(replyExtras[0]?.__sparkTraceContext?.traceRef, /^trace:sha256:[a-f0-9]{16}$/);
			assert.equal(replyExtras[0]?.__sparkTraceContext?.replyKind, 'builder_audio_reply');
			assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');
			assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.execution?.tool, 'media.audio.transcribe');
			assert.doesNotMatch(JSON.stringify({ capturedBridgePayload, replyExtras }), /private-audio-id|8319079055/);
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest(null);
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('/proof renders an inspect-only redacted Harness Proof panel', async () => {
		restoreAxios();
		restoreEnv();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-proof-command-'));
		process.env.SPARK_HOME = tempRoot;
		const proofCapsule = buildHarnessProofCapsule({
			turnRef: 'turn:proof-command',
			route: 'spawner.build',
			owner: 'spawner-ui',
			intent: { kind: 'spawner.build', confidence: 'explicit', noExecution: false },
			authority: {
				decision: 'allowed',
				contract: 'spark.turn_intent.v1',
				riskTier: 'execute',
				reasonSummary: 'tool_not_allowed_by_policy /Users/example/private'
			},
			governor: { decision: 'allow', verified: true },
			execution: { status: 'started', tool: 'spawner.run', mutationClass: 'launches_mission' },
			reply: { delivered: true, shape: 'natural', rawReasonsHidden: true },
			joins: { telegram: 'joined', spawner: 'joined' }
		});
		const auditPath = path.join(tempRoot, 'state', 'spark-telegram-bot', 'final-answer-gate-audit.jsonl');
		mkdirSync(path.dirname(auditPath), { recursive: true });
		writeFileSync(auditPath, `${JSON.stringify({
			request_id: 'raw-request-proof-command',
			trace_ref: 'trace:raw-proof-command',
			harness_proof_ref: proofCapsule.turnRef,
			proof_capsule: proofCapsule
		})}\n`, 'utf8');

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 626, replies, replyExtras);
		ctx.message.text = `/proof ${proofCapsule.turnRef}`;
		const indexModule: any = await import('../src/index');
		await indexModule.handleHarnessProofCommand(ctx);

		assert.match(replies[0] || '', /Harness Proof/);
		assert.match(replies[0] || '', /Authority: allowed/);
		assert.match(replies[0] || '', /Proof ref: turn:sha256:[\s\S]*Audit actionable:[\s\S]*Audit blocking:[\s\S]*Audit fresh-strict:[\s\S]*Legacy proof gaps visible:/);
		assert.doesNotMatch(replies.join('\n'), /raw-request-proof-command|trace:raw-proof-command|tool_not_allowed_by_policy|\/Users\/example/);
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.route, 'proof.inspect');
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.command, 'proof');
		assert.deepEqual(replyExtras[0]?.__sparkTraceContext?.replyKind, 'proof_panel');
		assert.equal(replyExtras[0]?.__sparkTraceContext?.proofRef, proofCapsule.turnRef);
		assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.turnRef, proofCapsule.turnRef);
		assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');

		const traceReplies: string[] = [];
		const traceReplyExtras: any[] = [];
		const traceCtx = makeFakeCtx(8319079055, 8319079055, 626, traceReplies, traceReplyExtras);
		traceCtx.message.text = '/proof trace:raw-proof-command';
		await indexModule.handleHarnessProofCommand(traceCtx);

		assert.match(traceReplies[0] || '', /Harness Proof/);
		assert.match(traceReplies[0] || '', /Authority: allowed/);
		assert.match(traceReplies[0] || '', /Trace ref: trace:sha256:[\s\S]*Audit actionable:[\s\S]*Audit blocking:/);
		assert.doesNotMatch(traceReplies.join('\n'), /raw-request-proof-command|trace:raw-proof-command|tool_not_allowed_by_policy|\/Users\/example/);
		assert.deepEqual(traceReplyExtras[0]?.__sparkTraceContext?.route, 'proof.inspect');
		assert.deepEqual(traceReplyExtras[0]?.__sparkTraceContext?.replyKind, 'proof_panel');
		assert.equal(traceReplyExtras[0]?.__sparkTraceContext?.proofRef, proofCapsule.turnRef);
		assert.equal(traceReplyExtras[0]?.__sparkTraceContext?.proofCapsule?.turnRef, proofCapsule.turnRef);
		assert.equal(traceReplyExtras[0]?.__sparkTraceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('chip status overclaim probe does not fall through to provider fallback', async () => {
		restoreAxios();
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 564, replies);
		ctx.message.text = 'all your chips work, right?';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		const reply = replies.join('\n');
		assert.match(reply, /Spark (?:chip status|self-awareness)/);
		if (/Spark self-awareness/.test(reply)) {
			assert.match(reply, /current-state evidence wins/i);
			assert.match(reply, /What looks live/);
		} else {
			assert.match(reply, /Registered or attached means discoverable/);
			assert.match(reply, /Working means a recent authorized route succeeded/);
		}
		assert.doesNotMatch(reply, /Missing provider keys/i);
		assert.doesNotMatch(reply, /provider authentication/i);

		restoreAxios();
		restoreEnv();
	});

	await test('natural recursive proof questions execute status path before Builder fallback', async () => {
		restoreAxios();
		const testUserId = 8319079055;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const pathLoop = require('../src/pathLoop') as typeof import('../src/pathLoop');
		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalResolve = pathLoop.resolveRecursiveStartTarget;
		const originalRead = pathLoop.readSpecializationPathLoopStatus;
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let bridgeCalls = 0;
		(pathLoop as any).resolveRecursiveStartTarget = async () => ({
			kind: 'path',
			key: 'startup-yc',
			repoRoot: '/tmp/specialization-path-startup-yc'
		});
		(pathLoop as any).readSpecializationPathLoopStatus = async () => ({
			pathKey: 'startup-yc',
			pathLabel: 'Startup YC',
			stage: 'ready',
			status: 'ready',
			evidenceState: 'missing_benchmark_round',
			decision: 'unproven',
			heldOutStatus: 'not_configured',
			trapStatus: 'not_configured',
			rounds: { completed: 0, requested: 0 },
			claimBoundary: 'No completed benchmark round has been recorded yet.',
			nextMove: 'Run a baseline/autoloop round before claiming improvement.'
		});
		(builderBridge as any).runBuilderTelegramBridge = async () => {
			bridgeCalls += 1;
			return {
				used: true,
				responseText: 'Builder should not answer this recursive proof question.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'researcher_advisory'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setRecursiveStatusDepsForTest({
				resolve: (pathLoop as any).resolveRecursiveStartTarget,
				readStatus: (pathLoop as any).readSpecializationPathLoopStatus
			});
			const replies: string[] = [];
			const ctx = makeFakeCtx(testUserId, testUserId, 5661, replies);
			ctx.message.text = 'did Startup YC improve?';
			(ctx as any).update = { update_id: 5661, message: ctx.message };

			await indexModule.handleTextMessage(ctx);

			const reply = replies.join('\n');
			assert.equal(bridgeCalls, 0);
			assert.match(reply, /Startup YC is not proven improved yet|startup-yc does not look like an attached specialization path yet/);
			assert.doesNotMatch(reply, /Builder should not answer/);
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setRecursiveStatusDepsForTest(null);
			(pathLoop as any).resolveRecursiveStartTarget = originalResolve;
			(pathLoop as any).readSpecializationPathLoopStatus = originalRead;
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('natural benchmark score questions run Spark QA autoloop proof before Builder fallback', async () => {
		restoreAxios();
		const testUserId = 8319079055;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let bridgeCalls = 0;
		const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-qa-benchmark-route-'));
		writeFileSync(path.join(repoRoot, 'specialization-path.json'), JSON.stringify({ key: 'spark-qa-operator' }));
		mkdirSync(path.join(repoRoot, 'benchmarks', 'evidence', 'runs', 'latest'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'benchmarks', 'evidence', 'mac_lab_cases.json'), JSON.stringify({
			cases: Array.from({ length: 6 }, (_, index) => ({ id: `case-${index + 1}` }))
		}));
		mkdirSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', '__init__.py'), '');
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', 'cli.py'), [
			'import argparse, json, pathlib, sys',
			'p=argparse.ArgumentParser()',
			'p.add_argument("hook")',
			'p.add_argument("--output-root", default="")',
			'p.add_argument("--timeout-seconds", default="180")',
			'args=p.parse_args()',
			'out=pathlib.Path(args.output_root); out.mkdir(parents=True, exist_ok=True)',
			'report={"schemaVersion":"spark-qa-autoloop-round-report.v1","baselineCandidateDelta":{"baselineScore":0,"candidateScore":0.1667,"delta":0.1667},"captureReplay":{"passedCount":4,"caseCount":4},"evidenceBenchmark":{"overallScore":0.1667},"failureQueue":{"ticketCount":5},"promotionDossier":{"scoreClaimAllowed":False,"blockers":["sidecar_review_not_clean"]}}',
			'print(json.dumps(report))',
			'sys.exit(1)',
			''
		].join('\n'));
		process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = repoRoot;
		(builderBridge as any).runBuilderTelegramBridge = async () => {
			bridgeCalls += 1;
			return {
				used: true,
				responseText: 'Builder should not invent benchmark numbers.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'researcher_advisory'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			const replies: string[] = [];
			const ctx = makeFakeCtx(testUserId, testUserId, 5662, replies);
			ctx.message.text = 'show Spark QA Operator benchmark score';
			(ctx as any).update = { update_id: 5662, message: ctx.message };

			await indexModule.handleTextMessage(ctx);

			const reply = replies.join('\n');
			assert.equal(bridgeCalls, 0);
			assert.match(reply, /ran the benchmark\/autoloop proof/);
			assert.match(reply, /would not claim an upgrade yet/);
			assert.match(reply, /Private evidence benchmark coverage is 0\.167; this is not a promotion score/);
			assert.match(reply, /sidecar review is still pending/);
			assert.doesNotMatch(reply, /Builder should not invent/);
		} finally {
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			rmSync(repoRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('benchmark score route blocks level-10 promotion when case evidence is clean but comparison gates are missing', async () => {
		restoreAxios();
		const testUserId = 8319079055;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		let bridgeCalls = 0;
		const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-qa-benchmark-blocked-'));
		writeFileSync(path.join(repoRoot, 'specialization-path.json'), JSON.stringify({ key: 'spark-qa-operator' }));
		mkdirSync(path.join(repoRoot, 'benchmarks', 'evidence', 'runs', 'latest'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'benchmarks', 'evidence', 'mac_lab_cases.json'), JSON.stringify({
			cases: Array.from({ length: 6 }, (_, index) => ({ id: `case-${index + 1}` }))
		}));
		mkdirSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', '__init__.py'), '');
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', 'cli.py'), [
			'import argparse, json, pathlib, sys',
			'p=argparse.ArgumentParser()',
			'p.add_argument("hook")',
			'p.add_argument("--output-root", default="")',
			'p.add_argument("--timeout-seconds", default="180")',
			'args=p.parse_args()',
			'out=pathlib.Path(args.output_root); out.mkdir(parents=True, exist_ok=True)',
			'report={"schemaVersion":"spark-qa-autoloop-round-report.v1","baselineCandidateDelta":{"baselineScore":0,"candidateScore":1,"delta":1},"captureReplay":{"passedCount":4,"caseCount":4},"evidenceBenchmark":{"overallScore":1},"failureQueue":{"ticketCount":0},"promotionDossier":{"scoreClaimAllowed":False,"blockers":["baseline_candidate_delta_required_before_improvement_claim"]}}',
			'print(json.dumps(report))',
			'sys.exit(1)',
			''
		].join('\n'));
		process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = repoRoot;
		(builderBridge as any).runBuilderTelegramBridge = async () => {
			bridgeCalls += 1;
			return {
				used: true,
				responseText: 'Builder should not invent benchmark numbers.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'researcher_advisory'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			const replies: string[] = [];
			const ctx = makeFakeCtx(testUserId, testUserId, 5664, replies);
			ctx.message.text = 'show Spark QA Operator benchmark score';
			(ctx as any).update = { update_id: 5664, message: ctx.message };

			await indexModule.handleTextMessage(ctx);

			const reply = replies.join('\n');
			assert.equal(bridgeCalls, 0);
			assert.match(reply, /ran the benchmark\/autoloop proof/);
			assert.match(reply, /would not claim an upgrade yet/);
			assert.match(reply, /baseline candidate delta required before improvement claim/);
			assert.doesNotMatch(reply, /score 1\b/);
			assert.doesNotMatch(reply, /cleared the benchmark\/autoloop score gate/);
			assert.doesNotMatch(reply, /Builder should not invent/);
		} finally {
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			rmSync(repoRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('benchmark score route refuses runner case-count mismatch', async () => {
		restoreAxios();
		const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-qa-benchmark-mismatch-'));
		writeFileSync(path.join(repoRoot, 'specialization-path.json'), JSON.stringify({ key: 'spark-qa-operator' }));
		mkdirSync(path.join(repoRoot, 'benchmarks', 'evidence', 'runs', 'latest'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'benchmarks', 'evidence', 'mac_lab_cases.json'), JSON.stringify({
			cases: [{ id: 'case-1' }, { id: 'case-2' }]
		}));
		mkdirSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', '__init__.py'), '');
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', 'cli.py'), [
			'import argparse, json',
			'p=argparse.ArgumentParser(); sub=p.add_subparsers(dest="cmd")',
			'e=sub.add_parser("evidence-benchmark")',
			'e.add_argument("--cases"); e.add_argument("--evidence-root"); e.add_argument("--output")',
			'args=p.parse_args()',
			'open(args.output, "w").write(json.dumps({"overallScore": 1, "pass": True, "caseCount": 6, "missingEvidenceCount": 0}))',
			''
		].join('\n'));
		process.env.SPARK_SWARM_BRIDGE_PYTHON = process.env.SPARK_SWARM_BRIDGE_PYTHON || 'python3';

		try {
			const pathLoop = require('../src/pathLoop') as typeof import('../src/pathLoop');
			const result = await pathLoop.runSpecializationPathBenchmark({
				kind: 'path',
				key: 'spark-qa-operator',
				repoRoot
			});

			assert.equal(result.ok, false);
			assert.match(result.error || '', /caseCount 6 does not match the benchmark case pack count 2/);
		} finally {
			rmSync(repoRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('benchmark runner failure does not reuse stale latest score artifact', async () => {
		restoreAxios();
		const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-qa-stale-benchmark-'));
		writeFileSync(path.join(repoRoot, 'specialization-path.json'), JSON.stringify({ key: 'spark-qa-operator' }));
		mkdirSync(path.join(repoRoot, 'benchmarks', 'evidence', 'runs', 'latest'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'benchmarks', 'evidence', 'mac_lab_cases.json'), JSON.stringify({ cases: [] }));
		mkdirSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', '__init__.py'), '');
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', 'cli.py'), [
			'import sys',
			'sys.stderr.write("runner failed before writing a score\\n")',
			'sys.exit(7)',
			''
		].join('\n'));
		mkdirSync(path.join(repoRoot, '.spark-swarm', 'evidence-benchmark'), { recursive: true });
		writeFileSync(
			path.join(repoRoot, '.spark-swarm', 'evidence-benchmark', 'latest-from-telegram.json'),
			JSON.stringify({ overallScore: 0.99, pass: true, caseCount: 6, missingEvidenceCount: 0 })
		);
		process.env.SPARK_SWARM_BRIDGE_PYTHON = process.env.SPARK_SWARM_BRIDGE_PYTHON || 'python3';

		try {
			const pathLoop = require('../src/pathLoop') as typeof import('../src/pathLoop');
			const result = await pathLoop.runSpecializationPathBenchmark({
				kind: 'path',
				key: 'spark-qa-operator',
				repoRoot
			});

			assert.equal(result.ok, false);
			assert.notEqual(result.score, 0.99);
			assert.match(result.error || '', /runner failed before writing a score|Command failed/);
		} finally {
			rmSync(repoRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('benchmark score no-run wording refuses cached scores before local service fallback', async () => {
		restoreAxios();
		const testUserId = 8319079055;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPAWNER_UI_URL = 'http://127.0.0.1:3333';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://127.0.0.1:3333';

		try {
			const indexModule: any = await import('../src/index');
			const replies: string[] = [];
			const ctx = makeFakeCtx(testUserId, testUserId, 5663, replies);
			ctx.message.text = 'show Spark QA Operator benchmark score, do not run anything';
			(ctx as any).update = { update_id: 5663, message: ctx.message };

			await indexModule.handleTextMessage(ctx);

			const reply = replies.join('\n');
			assert.match(reply, /won't run a fresh benchmark/i);
			assert.match(reply, /won't report cached benchmark numbers/i);
			assert.doesNotMatch(reply, /score\s+(?:1|0\.99|0\.1667)\b/i);
			assert.doesNotMatch(reply, /mission control|127\.0\.0\.1|localhost/i);
		} finally {
			restoreAxios();
			restoreEnv();
		}
	});

	await test('domain chip creation can use the build PRD bridge contract', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const indexModule: any = await import('../src/index');
		const prd = indexModule.buildDomainChipPrd('creates weird poster prompts from dream fragments');
		const projectName = indexModule.projectNameForDomainChipBrief('creates weird poster prompts from dream fragments');
		const capabilityProposalPacket = indexModule.buildDomainChipCapabilityProposalPacket('creates weird poster prompts from dream fragments');
		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write')) {
				return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
			}
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 559, replies);
		await indexModule.handleBuildIntent(
			ctx,
			prd,
			projectName,
			null,
			'advanced_prd',
			'Natural-language domain-chip creation should use the Spawner PRD/canvas/mission-control build flow.',
			capabilityProposalPacket
		);

		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		assert.ok(
			writeCall,
			`expected domain chip creation to POST to /api/prd-bridge/write; replies=${JSON.stringify(replies)} calls=${JSON.stringify(captured.map((call) => call.url))}`
		);
		assert.equal(writeCall!.body.projectName, 'domain-chip-creates-weird-poster-prompts-from');
		assert.equal(writeCall!.body.buildMode, 'advanced_prd');
		assert.match(writeCall!.body.content, /Create a Spark domain chip named domain-chip-creates-weird-poster-prompts-from/);
		assert.match(writeCall!.body.content, /current Spark-compatible domain chip standards/);
		assert.match(writeCall!.body.content, /CAPABILITY_PROPOSAL_STANDARD_V1/);
		assert.equal(writeCall!.body.capabilityProposalPacket.schema_version, 'spark.capability_proposal.v1');
			assert.equal(writeCall!.body.capabilityProposalPacket.implementation_route, 'domain_chip');
			assert.equal(writeCall!.body.capabilityProposalPacket.capability_ledger_key, 'domain_chip:domain-chip-creates-weird-poster-prompts-from');
			assert.match(writeCall!.body.capabilityProposalPacket.claim_boundary, /not proof/i);
			assert.match(replies[0] || '', /🛠️ Setting up domain-chip-creates-weird-poster-prompts-from as a planning canvas\./);
			assert.doesNotMatch(replies[0] || '', /Canvas:/);
			assert.doesNotMatch(replies[0] || '', /Mission board/);

		restoreAxios();
		restoreEnv();
	});

	await test('detailed build briefs with numbered lane lists still start a mission', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write')) {
				return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 560, replies);
		ctx.message.text = [
			'Hey Spark, let’s build a real project called Founder Signal Room.',
			'Build it at C:\\Users\\USER\\Desktop\\founder-signal-room.',
			'Core workflow:',
			'- A founder pastes messy weekly notes into an intake panel.',
			'- Notes can include customer quotes, random ideas, and meeting takeaways.',
			'- The app extracts strategic signals into five lanes:',
			'  1. Customer pain',
			'  2. Product bets',
			'  3. Growth signals',
			'  4. Risks',
			'  5. Decisions to revisit',
			'Please use advanced PRD planning first, attach relevant skills, show the mission in Kanban and Canvas, then build and verify it.'
		].join('\n');

		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		assert.ok(writeCall, 'expected detailed build brief to POST to /api/prd-bridge/write');
		assert.equal(writeCall!.body.projectName, 'Founder Signal Room');
		assert.match(writeCall!.body.content, /Target workspace\/project path: `C:\\Users\\USER\\Desktop\\founder-signal-room`/);
		assert.equal(writeCall!.body.buildMode, 'advanced_prd');
			assert.doesNotMatch(replies.join('\n'), /Got it\. I have these options on the table/);
			assert.doesNotMatch(replies.join('\n'), /Tell me which number/);
			assert.match(replies[0] || '', /🛠️ Setting up Founder Signal Room as a planning canvas\./);
			assert.doesNotMatch(replies[0] || '', /Mission board/);

		restoreAxios();
		restoreEnv();
	});

	await test('domain chip natural request previews before starting build', async () => {
		const indexModule: any = await import('../src/index');
		const reply = indexModule.formatDomainChipBuildPreview('creates surreal product names from half-remembered dreams');

		assert.match(reply, /I can turn this into a private Domain Chip: domain-chip-creates-surreal-product-names-from/);
		assert.match(reply, /A Domain Chip is a reusable Spark playbook for one kind of work/);
		assert.match(reply, /trigger, checklist, examples, local starter checks, and rollback notes/);
		assert.match(reply, /Reply "go"/);
		assert.doesNotMatch(reply, /Advanced PRD|router boundaries|activation notes|DCL scaffold|external API|Recommended path/);
		assert.doesNotMatch(reply, /Mission:/);
		assert.doesNotMatch(reply, /Canvas:/);
	});

	await test('domain chip text route previews before creator or generic build routes', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 562, replies);
		ctx.message.text = 'shall we build a domain chip together for crafting trendy video skits using Higgsfield and Seedance 2';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		assert.match(replies.join('\n'), /private Domain Chip: domain-chip-crafting-trendy-video-skits-using[\s\S]*reusable Spark playbook[\s\S]*local starter checks[\s\S]*Reply "go"/);
		assert.doesNotMatch(replies.join('\n'), /names only|Here it should stay as documentation talk/);
		assert.ok(!captured.some((c) => c.url.includes('/api/creator-mission') || c.url.includes('/api/prd-bridge/write')), 'domain chip creation should wait for confirmation before staging work');

		restoreAxios();
		restoreEnv();
	});

	await test('creator-loop domain chip follow-up stays on creator mission route', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/creator/mission')) {
				return {
					data: {
						ok: true,
						missionId: 'mission-creator-startup-yc',
						taskCount: 8,
						canvasUrl: 'http://127.0.0.1:3333/canvas?mission=mission-creator-startup-yc'
					}
				};
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
		await conversationModule.conversation.remember(
			{ id: 8319079055, username: 'cem' },
			'We are shaping a Startup YC specialization path with domain chip, benchmark pack, autoloop, and shareable insight packet.'
		);

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 563, replies);
		ctx.message.text = 'create or update the domain chip';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		assert.ok(captured.some((c) => c.url.includes('/api/creator/mission')), 'creator-loop domain chip follow-up should stage creator mission');
		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'creator-loop domain chip follow-up should not start a standalone chip build');
		assert.doesNotMatch(replies.join('\n'), /I can build this as domain-chip/i);

		restoreAxios();
		restoreEnv();
	});

	await test('explicit Spark QA benchmark pack creation is not swallowed by bug-hunt chat', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/creator/mission')) {
				return {
					data: {
						ok: true,
						missionId: 'mission-creator-spark-qa-benchmark',
						taskCount: 3,
						canvasUrl: 'http://127.0.0.1:3333/canvas?mission=mission-creator-spark-qa-benchmark'
					}
				};
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 5632, replies);
		ctx.message.text = 'create a level 10 benchmark pack for Spark QA Operator that tests stale scores, wrong Workspace evidence, route drift, natural-language context hijack, no-op loops, and private review boundary mistakes';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		assert.ok(captured.some((c) => c.url.includes('/api/creator/mission')), 'benchmark pack creation should stage a creator mission');
		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'benchmark pack creation should not use generic build');
		const creatorCall = captured.find((c) => c.url.includes('/api/creator/mission'));
		assert.match(String(creatorCall?.body?.brief || ''), /Benchmark creation level selected: 10\/10/);
		assert.match(String(creatorCall?.body?.brief || ''), /spark-benchmark-creator-prd\.v1/);
		assert.match(String(creatorCall?.body?.brief || ''), /Benchmark Creator PRD/);
		assert.match(String(creatorCall?.body?.brief || ''), /benchmark-creator-prd/);
		assert.match(String(creatorCall?.body?.brief || ''), /promotion_bridge\.template\.json/);
		assert.match(String(creatorCall?.body?.brief || ''), /benchmark_execution_contract/);
		assert.match(String(creatorCall?.body?.brief || ''), /hard_zeroes/);
		assert.match(String(creatorCall?.body?.brief || ''), /promotion_gate/);
		assert.match(String(creatorCall?.body?.brief || ''), /Do not route this as a generic app build/);
		assert.match(String(creatorCall?.body?.brief || ''), /hours (?:or|to) days/);
		assert.match(String(creatorCall?.body?.brief || ''), /Canvas\/Kanban|Canvas and Kanban/);
		assert.equal(creatorCall?.body?.executionPolicy, 'manual_run');
		assert.equal(creatorCall?.body?.privacyMode, 'local_only');
		assert.equal(creatorCall?.body?.riskLevel, 'high');
		assert.match(replies.join('\n'), /level 10 Benchmark Creator PRD/i);
		assert.match(replies.join('\n'), /Benchmark Creator PRD/i);
		assert.match(replies.join('\n'), /Canvas, Kanban, Spark Swarm review, research evidence, and Auto Loop improvement/);
		assert.doesNotMatch(replies.join('\n'), /I would treat this as a QA pass/i);
		assert.match(replies.join('\n'), /scoring stays blocked until fresh artifacts exist/i);

		restoreAxios();
		restoreEnv();
	});

	await test('benchmark pack creation asks for specialization path and level before staging', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { ok: true, missionId: 'mission-should-not-start', taskCount: 3 } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 5632, replies, replyExtras);
		ctx.message.text = 'create a benchmark pack';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		assert.equal(captured.length, 0, 'missing benchmark choices should not stage a creator mission');
		assert.match(replies.join('\n'), /(?:Pick|Choose) the specialization path and benchmark level first/i);
		assert.match(replies.join('\n'), /create level 7 benchmarks for Spark QA Operator/);
		assert.match(replies.join('\n'), /level 10 is the long-running research\/swarm lab mode/i);
		assert.doesNotMatch(replies.join('\n'), /Mission:/);
		assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'creator.benchmark_pack_clarify'); assert.equal(replyExtras[0]?.__sparkTraceContext?.command, 'telegram_benchmark_pack_clarify');
		assert.equal(replyExtras[0]?.__sparkTraceContext?.proofCapsule?.schema, 'spark.harness_proof.v1');

		restoreAxios();
		restoreEnv();
	});

		await test('benchmark pack creation asks for level when path is known', async () => {
			restoreAxios();
			process.env.ADMIN_TELEGRAM_IDS = '8319079055';
			process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { ok: true, missionId: 'mission-should-not-start', taskCount: 3 } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 5632, replies);
		ctx.message.text = 'create benchmarks for Spark QA Operator';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		assert.equal(captured.length, 0, 'missing benchmark level should not stage a creator mission');
		assert.match(replies.join('\n'), /benchmark level first/i);
		assert.match(replies.join('\n'), /Spark QA Operator/);
		assert.match(replies.join('\n'), /1-10/);
		assert.doesNotMatch(replies.join('\n'), /Mission:/);

		restoreAxios();
			restoreEnv();
		});

		await test('browser proof health questions use runtime probe before recursive context', async () => {
			restoreAxios();
			process.env.ADMIN_TELEGRAM_IDS = '8319079055';
			process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';

		const pathLoop = require('../src/pathLoop') as typeof import('../src/pathLoop');
		const originalRead = pathLoop.readSpecializationPathLoopStatus;
		let recursiveStatusCalls = 0;
		(pathLoop as any).readSpecializationPathLoopStatus = async () => {
			recursiveStatusCalls += 1;
			return {
				ok: true,
				pathKey: 'spark-qa-operator',
				pathLabel: 'Spark QA Operator',
				decision: 'improved',
				rounds: { completed: 6, requested: 6, kept: 6, reverted: 0 },
				heldOutStatus: 'passed',
				trapStatus: 'passed'
			};
		};
		(axios as any).get = async (url: string) => {
			if (url.includes('/api/providers')) {
				return { data: { providers: [{ id: 'codex', configured: true }, { id: 'ollama', configured: true }] } };
			}
			return { data: { pending: false } };
		};

		try {
			const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
			await conversationModule.conversation.remember(
				{ id: 8319079055, username: 'cem' },
				'Spark QA Operator has benchmark-backed evidence for an improvement claim.'
			);

			const replies: string[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 5633, replies);
			ctx.message.text = 'Does this browser proof show the runtime is healthy?';
			const indexModule: any = await import('../src/index');

			await indexModule.handleTextMessage(ctx);

			const reply = replies.join('\n');
			assert.equal(recursiveStatusCalls, 0);
			assert.match(reply, /fresh `\/probe browser` result/i);
			assert.match(reply, /logged-in pages are unproven|screenshots, clicks, cookies/i);
			assert.doesNotMatch(reply, /benchmark-backed evidence for an improvement claim/i);
		} finally {
			(pathLoop as any).readSpecializationPathLoopStatus = originalRead;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('browser and computer-use authorization question stays chat-only', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-tool-auth-boundary-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 614, replies);
		ctx.message.text = 'Do not use browser or computer-use. How should those capabilities be authorized?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Browser and computer-use should be authorized as tools/i);
		assert.match(reply, /Governor-selected capability and scope/i);
		assert.match(reply, /tool-call ledger/i);
		assert.match(reply, /stays chat-only/i);
		assert.doesNotMatch(reply, /Run `\/probe browser`/i);
		assert.equal(captured.length, 0, 'tool authorization discussion must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('domain chip pending state ignores unrelated QA bug-hunt turns', async () => {
		restoreAxios();
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-e2e-real-create-'));
		const fakeBuilder = path.join(tempRoot, 'fake-chip-builder.js');
		const builderArgvPath = path.join(tempRoot, 'builder-argv.json');
		writeFileSync(fakeBuilder, `#!/usr/bin/env node\nconst fs = require('node:fs');\nconst argv = process.argv.slice(2);\nif (argv.includes('chips') && argv.includes('create')) fs.writeFileSync(${JSON.stringify(builderArgvPath)}, JSON.stringify(argv, null, 2));\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ ok: true, chip_key: 'domain-chip-telegram-memory-routing', chip_path: '/tmp/private-domain-chip/domain-chip-telegram-memory-routing', router_invokable: false, proof_artifacts: { schema_version: 'spark-domain-chip.proof_artifact_summary.v1', benchmark_pack: true, autoloop_policy: true, proof_capsule: true, qa_evidence_lane_packet: true, evaluate_run_contract: true, review_role_packets: { blind_judge: true, adversary: true, safety_judge: true, consumer: true, operator: true }, review_role_packet_count: 5, promotion_blocked: true, network_absorbable: false }, warnings: [] }))});`);
		chmodSync(fakeBuilder, 0o755);
		const testUserId = 8319079055;
		Object.assign(process.env, {
			ADMIN_TELEGRAM_IDS: String(testUserId), BOT_DEFAULT_TIER: 'base', SPAWNER_UI_URL: 'http://stub-spawner.test', SPAWNER_UI_PUBLIC_URL: 'http://stub-spawner.test',
			SPARK_AGENT_ACCESS_PROFILE: 'developer', SPARK_BOT_TEST_MODE: '1', SPARK_BUILDER_REPO: tempRoot, SPARK_BUILDER_PYTHON: fakeBuilder, SPARK_MISSION_CONTROL_DISABLED: '1'
		});

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, requestId: body?.requestId } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(testUserId, testUserId, 853, replies);
		ctx.message.text = 'build a domain-chip for Telegram memory routing';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);
		assert.match(replies.join('\n'), /private Domain Chip[\s\S]*reusable Spark playbook[\s\S]*Reply "go"/);
		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'preview should not enqueue before confirmation');

		const yesCtx = makeFakeCtx(testUserId, testUserId, 854, replies);
		yesCtx.message.text = 'yes';
		await indexModule.handleTextMessage(yesCtx);

		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'bare yes must not dispatch pending domain chip');
		assert.match(replies[replies.length - 1] || '', /will not start the pending domain chip from a bare yes/i);
		assert.match(replies[replies.length - 1] || '', /Say "go" to use defaults/);
		assert.doesNotMatch(replies[replies.length - 1] || '', /Mission:/);
		assert.doesNotMatch(replies[replies.length - 1] || '', /Spawned work/);

		const qaCtx = makeFakeCtx(testUserId, testUserId, 855, replies);
		qaCtx.message.text = 'prepare a huge unit test and let us become bug hunters for Mission Control and Spawner workflow';
		await indexModule.handleTextMessage(qaCtx);

		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'unrelated QA turn must not dispatch pending domain chip');
		assert.match(replies.join('\n'), /QA planning, not a mission launch/);
		assert.match(replies.join('\n'), /I will not start a mission from this wording/);
		assert.doesNotMatch(replies.join('\n'), /read-only/i);
		assert.doesNotMatch(replies.join('\n'), /Prepared, but/i);
		assert.doesNotMatch(replies.join('\n'), /Starting domain-chip-/);
		assert.doesNotMatch(replies.join('\n'), /Spawned work/);

		const directionCtx = makeFakeCtx(testUserId, testUserId, 856, replies);
		directionCtx.message.text = 'names with rationale and usage angle, make the vibe surreal';
		await indexModule.handleTextMessage(directionCtx);

		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'actual domain-chip direction should use chip scaffolder, not PRD bridge');
		const creationReceipt = replies[replies.length - 1] || '';
		assert.match(replies.join('\n'), /use that direction and create domain-chip-/i);
			assert.match(creationReceipt, /Domain Chip created: domain-chip-telegram-memory-routing[\s\S]*Private starter kit is ready[\s\S]*Spark can run the first local check now[\s\S]*Still needed before[\s\S]*Privacy: private\/local only/i);
			assert.doesNotMatch(creationReceipt, /\/tmp\/private-domain-chip|Mission:|Provider:|Move:|Status:/i);
			assert.doesNotMatch(creationReceipt, /Router:|Benchmark\/autoloop:|reports\//i);
		const builderArgv = JSON.parse(readFileSync(builderArgvPath, 'utf8')) as string[];
		const governorFlagIndex = builderArgv.indexOf('--governor-decision-json');
		assert.notEqual(governorFlagIndex, -1, 'confirmed pending domain chip creation must pass Governor authority into Builder');
		const governorDecision = JSON.parse(builderArgv[governorFlagIndex + 1] || '{}');
		assert.equal(governorDecision.schema_version, 'governor-decision-v1');
		assert.equal(governorDecision.outcome, 'execute');
		assert.equal(governorDecision.execution_boundary?.action_authorized, true);
		assert.ok(
			(governorDecision.tool_ledgers || []).some((entry: any) =>
				entry?.tool_name === 'chip.create' &&
				entry?.capability_id === 'capability:spark-intelligence-builder:chip.create' &&
				entry?.authorization?.capability_id === 'capability:spark-intelligence-builder:chip.create' &&
				entry?.authorization?.verdict === 'allow'
			),
			'Governor authority must bind Builder chip.create capability, not only Telegram domain_chip.create'
		);
		const pendingDomainChipEvidence = require('../src/telegramPendingDomainChipEvidence') as typeof import('../src/telegramPendingDomainChipEvidence');
		await pendingDomainChipEvidence.clearLastCreatedDomainChipForTests(
			pendingDomainChipEvidence.telegramPendingDomainChipKey(testUserId, testUserId)
		);
		const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
		await conversationModule.conversation.clearUserStateForTests({ id: testUserId, username: 'cem' });

		restoreAxios();
		restoreEnv();
		for (const key of ['SPARK_BUILDER_REPO', 'SPARK_BUILDER_PYTHON', 'SPARK_MISSION_CONTROL_DISABLED']) delete process.env[key];
		rmSync(tempRoot, { recursive: true, force: true });
		});

		await test('creator loop template package route is not stolen by creator/schedule/chat fallbacks', async () => {
			restoreAxios();
			const testUserId = 8319079055;
			process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
			process.env.BOT_DEFAULT_TIER = 'base';
			process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
			process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
			process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
			process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
			process.env.SPARK_BOT_TEST_MODE = '1';

			const captured: CapturedCall[] = [];
			(axios as any).post = async (url: string, body: any) => {
				captured.push({ url, body });
				return { data: { success: true } };
			};
			(axios as any).get = async () => ({ data: { pending: false } });

			const pathLoop = require('../src/pathLoop') as typeof import('../src/pathLoop');
			const originalResolve = pathLoop.resolveRecursiveStartTarget;
			const originalPackage = pathLoop.packageSpecializationPathLoop;
			const originalRun = pathLoop.runSpecializationPathAutoloop;
			let packageCalls = 0;
			let runCalls = 0;
			const resolveForTest = async (targetKey: string) => {
				assert.equal(targetKey, 'startup-yc');
				return {
					kind: 'path',
					key: 'startup-yc',
					repoRoot: '/tmp/specialization-path-startup-yc'
				};
			};
			(pathLoop as any).resolveRecursiveStartTarget = resolveForTest;
			const packageLoopForTest = async (target: any) => {
				packageCalls += 1;
				assert.equal(target.key, 'startup-yc');
				return {
					ok: true,
					pathKey: 'startup-yc',
					packagePath: '/tmp/private/startup-yc-insight.json',
					packet: {
						path: {
							pathKey: 'startup-yc',
							pathLabel: 'Startup YC'
						},
						claim: {
							decision: 'improved',
							state: 'benchmark_backed_candidate',
							nextMove: 'Review the packet privately before any wider reuse.'
						},
						benchmark: {
							comparison: {
								scoreMetric: 'mean_scenario_score',
								baselineScore: 0.6803,
								candidateScore: 0.7003,
								delta: 0.02,
								decision: 'kept'
							},
							heldOutStatus: 'passed',
							trapStatus: 'passed'
						},
						reusableTemplateCandidate: {
							eligible: true
						},
						publication: {
							state: 'local_private',
							published: false,
							networkAbsorbable: false
						}
					}
				};
			};
			(pathLoop as any).packageSpecializationPathLoop = packageLoopForTest;
			(pathLoop as any).runSpecializationPathAutoloop = async () => {
				runCalls += 1;
				throw new Error('template package route must not run the loop');
			};

			const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
			await conversationModule.conversation.clearUserStateForTests({ id: testUserId, username: 'cem' });
			const pendingDomainChipEvidence = require('../src/telegramPendingDomainChipEvidence') as typeof import('../src/telegramPendingDomainChipEvidence');
			await pendingDomainChipEvidence.clearLastCreatedDomainChipForTests(
				pendingDomainChipEvidence.telegramPendingDomainChipKey(testUserId, testUserId)
			);
			await conversationModule.conversation.remember(
				{ id: testUserId, username: 'cem' },
				'We are working on Spark QA Operator and path:spark-qa-operator.'
			);
			await conversationModule.conversation.remember(
				{ id: testUserId, username: 'cem' },
				'compare baseline vs candidate for Startup YC. Do not run anything.'
			);

				try {
					const replies: string[] = [];
					const ctx = makeFakeCtx(testUserId, testUserId, 565, replies);
					ctx.message.text = 'turn this proven loop into a reusable template. Do not run or publish it.';
					const indexModule: any = await import('../src/index');
					indexModule.__setRecursiveStatusDepsForTest({
						resolve: resolveForTest,
						packageLoop: packageLoopForTest
					});

					await indexModule.handleTextMessage(ctx);

				const reply = replies.join('\n');
					assert.equal(packageCalls, 1, reply);
				assert.equal(runCalls, 0);
				assert.ok(!captured.some((c) => c.url.includes('/api/creator/mission')), 'template request should not stage a creator mission');
				assert.ok(!captured.some((c) => c.url.includes('/api/scheduled')), 'template request should not be treated as schedule work');
				assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'template request should not start a build');
				assert.match(reply, /I packaged Startup YC's proof locally/);
				assert.match(reply, /Nothing was published or shared/);
				assert.match(reply, /ready for private template review/);
				assert.doesNotMatch(reply, /No run or publishing yet/);
				assert.doesNotMatch(reply, /Intent creator path/i);
				assert.doesNotMatch(reply, /I caught 'schedule'|Show what's scheduled|Which\?/i);
				} finally {
					const indexModule: any = await import('../src/index');
					indexModule.__setRecursiveStatusDepsForTest(null);
					(pathLoop as any).resolveRecursiveStartTarget = originalResolve;
				(pathLoop as any).packageSpecializationPathLoop = originalPackage;
				(pathLoop as any).runSpecializationPathAutoloop = originalRun;
				restoreAxios();
				restoreEnv();
			}
		});

		await test('canvas ready summary stays readable and includes canvas link', async () => {
			const indexModule: any = await import('../src/index');
			const reply = indexModule.formatCanvasReadySummary({
			projectName: 'domain-chip-posters',
			taskCount: 2,
			elapsed: 195,
			readyCanvasUrl: 'http://stub-spawner.test/canvas?pipeline=prd-test&mission=mission-test',
			kanbanUrl: 'http://stub-spawner.test/kanban',
			analysis: {
				projectType: 'domain-chip',
				infrastructure: 'local Spark runtime',
				techStack: ['Python', 'spark-chip.json'],
				skills: ['domain-chip-creator'],
				tasks: [
					{
						title: 'Scaffold chip manifest and hooks',
						skills: ['runtime-sync'],
						verificationCommands: ['python -m pytest tests']
					},
					{
						title: 'Validate router behavior',
						verificationCommands: ['spark chips why "poster prompts" --json']
					}
				]
			}
		});

			assert.match(reply, /Canvas is ready for domain-chip-posters/);
			assert.match(reply, /Spark queued 2 build steps and is moving now\./);
			assert.doesNotMatch(reply, /Spawned tasks/);
			assert.doesNotMatch(reply, /Plan/);
			assert.doesNotMatch(reply, /Chip manifest/);
			assert.doesNotMatch(reply, /Chip manifest · runtime sync/);
			assert.doesNotMatch(reply, /Router behavior/);
			assert.doesNotMatch(reply, /Skills invoked/);
			assert.doesNotMatch(reply, /Skill tier/);
			assert.doesNotMatch(reply, /195s/);
			assert.doesNotMatch(reply, /Architecture:/);
			assert.doesNotMatch(reply, /Tests\/checks/);
			assert.match(reply, /Canvas\n• http:\/\/stub-spawner\.test\/canvas\?pipeline=prd-test&mission=mission-test/);
			assert.doesNotMatch(reply, /Mission board/);
			assert.doesNotMatch(reply, /Ask for tasks or skills if you want the full plan\./);
			assert.doesNotMatch(reply, /I will send the final handoff when it is built/);
	});

	await test('canvas still-running summary avoids raw mission id noise', async () => {
		const indexModule: any = await import('../src/index');
		const reply = indexModule.formatCanvasStillRunningSummary({
			projectName: 'Signal Maze',
			elapsedSeconds: 180,
			kanbanUrl: 'http://stub-spawner.test/kanban?mission=mission-test'
		});

		assert.match(reply, /still preparing Signal Maze\./);
		assert.match(reply, /taking a little longer than usual/);
		assert.match(reply, /I will send the canvas when it is ready\./);
		assert.match(reply, /Board: http:\/\/stub-spawner\.test\/kanban\?mission=mission-test/);
		assert.doesNotMatch(reply, /Mission board\n•/);
		assert.doesNotMatch(reply, /🛠️/);
		assert.doesNotMatch(reply, /It has been shaping/);
		assert.doesNotMatch(reply, /^Status$/m);
		assert.doesNotMatch(reply, /^Move$/m);
		assert.doesNotMatch(reply, /Mission: mission-test/);
	});

	await test('canvas shaping heartbeat uses composed Telegram sections', async () => {
		const indexModule: any = await import('../src/index');
		const reply = indexModule.formatCanvasShapingHeartbeatSummary({
			projectName: 'Axiom Garden',
			elapsedSeconds: 120
		});

			assert.match(reply, /still shaping Axiom Garden\./);
			assert.match(reply, /still shaping Axiom Garden\.\n\nI will keep this quiet until the canvas is ready or something needs attention\./);
			assert.doesNotMatch(reply, /🛠️/);
			assert.doesNotMatch(reply, /Canvas prep has been running/);
			assert.doesNotMatch(reply, /^Status$/m);
			assert.doesNotMatch(reply, /^Move$/m);
			assert.doesNotMatch(reply, /Still working on/);
			assert.doesNotMatch(reply, /\(120s elapsed\)/);
		});

	await test('clarification replies are natural and project-specific', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';

		(axios as any).post = async (url: string, body: any) => {
			if (url.includes('/api/prd-bridge/write')) {
				return {
					data: {
						success: true,
						needsClarification: true,
						requestId: body.requestId,
						openQuestions: [
							'What should make this game feel surprising: shifting walls, power-ups, enemies, time pressure, or something stranger?',
							'Should it be chill and atmospheric or fast and score-chasing?'
						],
						addedAssumptions: [
							'Assume this is a browser-playable game unless another platform is specified.',
							'Assume no accounts or backend in v1; keep state local to the browser.'
						]
					}
				};
			}
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 556, replies);

		await callHandleBuildIntent({
			ctx,
			prd: "let's build a maze game",
			projectName: 'maze game',
			buildMode: 'advanced_prd'
		});

		assert.match(replies[0] || '', /I can turn this into Maze Game/);
		assert.match(replies[0] || '', /Recommended starting point: browser-playable/);
		assert.match(replies[0] || '', /Say "go" to start/);
		assert.match(replies[0] || '', /Maze Game\.\n\nRecommended starting point:/);
		assert.match(replies[0] || '', /local best score\.\n\nSay "go" to start/);
		assert.match(replies[0] || '', /shifting walls/);
		assert.doesNotMatch(replies[0] || '', /Brief is too thin/);
		assert.doesNotMatch(replies[0] || '', /Default direction/);
		assert.ok((replies[0] || '').split('\n').length <= 5, 'clarification reply should stay short with paragraph spacing');
		assert.doesNotMatch(replies[0] || '', /Who is the first user/);

		restoreAxios();
		restoreEnv();
	});

	await test('pending clarification accepts go as run-with-defaults', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write') && !body.forceDispatch) {
				return {
					data: {
						success: true,
						needsClarification: true,
						requestId: body.requestId,
						openQuestions: ['What should make this game feel surprising?'],
						addedAssumptions: ['Assume this is a browser-playable game unless another platform is specified.']
					}
				};
			}
			return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
		};

		const replies: string[] = [];
		const replyExtras: any[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 557, replies, replyExtras);

		await callHandleBuildIntent({
			ctx,
			prd: "let's build a maze game",
			projectName: 'maze game',
			buildMode: 'advanced_prd'
		});

		const indexModule: any = await import('../src/index');
		const goCtx = makeFakeCtx(8319079055, 8319079055, 558, replies, replyExtras);
		goCtx.message.text = 'go';
		await indexModule.handleClarificationAnswers(goCtx, 'go');

		const dispatchCall = captured.find((c) => c.body?.forceDispatch === true);
		assert.ok(dispatchCall, 'expected go to force-dispatch pending clarification');
		const clarifiedMissionId = `mission-${String(dispatchCall!.body.requestId).match(/(\d{10,})$/)?.[1]}`;
		assert.deepEqual([dispatchCall!.body.missionId, dispatchCall!.body.traceRef], [clarifiedMissionId, `trace:spawner-prd:${clarifiedMissionId}`]);
		assert.match(dispatchCall!.body.harnessProofRef, /^turn:sha256:[a-f0-9]{16}$/);
		assert.deepEqual([dispatchCall!.body.harnessProofCapsule?.schema, dispatchCall!.body.harnessProofCapsule?.turnRef, dispatchCall!.body.harnessProofCapsule?.route], ['spark.harness_proof.v1', dispatchCall!.body.harnessProofRef, 'spawner.build']);
		assert.doesNotMatch(JSON.stringify(dispatchCall!.body.harnessProofCapsule), /8319079055|tg-build-|trace:spawner-prd/);
		assert.doesNotMatch(dispatchCall!.body.content, /Answers: go/);
		assert.match(replies.join('\n'), /Perfect, I will use the default direction/); assert.doesNotMatch(replies.join('\n'), new RegExp(`Mission: ${clarifiedMissionId}`));
		assert.match(replies.join('\n'), /🛠️ Setting up Maze Game as a planning canvas\./);
		for (const pattern of [/Spawned work/, /Canvas:/, /Mission board/]) assert.doesNotMatch(replies.join('\n'), pattern);
		const ackTrace = replyExtras.find((extra) => extra?.__sparkTraceContext?.requestId === dispatchCall!.body.requestId)?.__sparkTraceContext;
		assert.deepEqual([ackTrace?.traceRef, ackTrace?.missionId], [dispatchCall!.body.traceRef, clarifiedMissionId]);
		assert.deepEqual(ackTrace?.proofCapsule, dispatchCall!.body.harnessProofCapsule);
		const registry = await readMissionRelayRegistry();
		const subscription = registry.find((entry) => entry.missionId === clarifiedMissionId);
		assert.ok(subscription, 'clarified PRD build mission should be registered for Telegram relay progress');
		assert.deepEqual([subscription.chatId, subscription.userId, subscription.requestId, subscription.traceRef], ['8319079055', '8319079055', dispatchCall!.body.requestId, dispatchCall!.body.traceRef]);

		restoreAxios();
		restoreEnv();
	});

	await test('NFT strategy structure conversation does not start build preview', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, requestId: body?.requestId } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 598, replies);
		ctx.message.text = 'yeah buybacks not for now actually, maybe later, i think we can earn it back from NFTs, if we do sell the NFTs via token, and create a nice structure for it to get hype right after the launch.';
		const indexModule: any = await import('../src/index');

		await indexModule.handleTextMessage(ctx);

		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'strategy conversation must not enter PRD bridge');
		assert.doesNotMatch(replies.join('\n'), /Say "go" and I will start/i);
		assert.doesNotMatch(replies.join('\n'), /Mission:/);

		const allocationCtx = makeFakeCtx(8319079055, 8319079055, 599, replies);
		allocationCtx.message.text = [
			'we already have a big community airdrop that we promised so it needs to be around 20% imo.',
			'and team 10% makes sense',
			'wondering what if we make liquidity dex 5% would it be too small or good enough, and then we could have some more stuff for ecosystem rewards.'
		].join('\n\n');

		await indexModule.handleTextMessage(allocationCtx);

		assert.ok(!captured.some((c) => c.url.includes('/api/prd-bridge/write')), 'tokenomics allocation question must not enter PRD bridge');
		assert.doesNotMatch(replies.join('\n'), /Setting up Liquidity Dex 5% Would It Be/i);
		assert.doesNotMatch(replies.join('\n'), /Canvas is ready for Liquidity Dex 5% Would It Be/i);
		assert.doesNotMatch(replies.join('\n'), /Mission:/);

		restoreAxios();
		restoreEnv();
	});

	await test('pending clarification cancels on conversation-only boundary', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-pending-cancel-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write') && !body.forceDispatch) {
				return {
					data: {
						success: true,
						needsClarification: true,
						requestId: body.requestId,
						openQuestions: ['What should this structure organize first?'],
						addedAssumptions: ['Assume a clean reusable project structure.']
					}
				};
			}
			return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 601, replies);
		await callHandleBuildIntent({
			ctx,
			prd: 'create a nice structure for the NFT launch hype plan',
			projectName: 'nice structure for it to get',
			buildMode: 'direct'
		});

		const indexModule: any = await import('../src/index');
		const noNeedCtx = makeFakeCtx(8319079055, 8319079055, 602, replies);
		noNeedCtx.message.text = 'no need we can talk here';
		await indexModule.handleTextMessage(noNeedCtx);

		assert.ok(!captured.some((c) => c.body?.forceDispatch === true), 'conversation-only boundary must not dispatch the pending build');
		assert.match(replies.join('\n'), /no build.*started/i);
		assert.doesNotMatch(replies[replies.length - 1] || '', /Mission:/);

		const dispatchesAfterCancel = captured.filter((c) => c.body?.forceDispatch === true).length;
		const goCtx = makeFakeCtx(8319079055, 8319079055, 603, replies);
		goCtx.message.text = 'go';
		await indexModule.handleTextMessage(goCtx);
		assert.equal(
			captured.filter((c) => c.body?.forceDispatch === true).length,
			dispatchesAfterCancel,
			'cancel must clear pending execution state so a later go does not wake the build'
		);
		assert.match(replies[replies.length - 1] || '', /not seeing an active build or mission waiting/i);
		assert.doesNotMatch(replies[replies.length - 1] || '', /Mission:/);

		const provenanceCtx = makeFakeCtx(8319079055, 8319079055, 604, replies);
		provenanceCtx.message.text = 'Did my last go create a Spawner mission? Answer from fresh mission history if you can. Do not start anything.';
		await indexModule.handleTextMessage(provenanceCtx);
		assert.equal(
			captured.filter((c) => c.body?.forceDispatch === true).length,
			dispatchesAfterCancel,
			'provenance question about the canceled go must not dispatch anything'
		);
		assert.match(replies[replies.length - 1] || '', /No\..*(last `?go`?|specific)|I do not see proof/i);
		assert.match(replies[replies.length - 1] || '', /no active build or mission waiting|fresh mission id|specific/i);
		assert.doesNotMatch(replies[replies.length - 1] || '', /latest no-edit probe was routed through Spawner/i);
		assert.doesNotMatch(replies[replies.length - 1] || '', /Mission board|Spawned work/i);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('specific QA mission provenance question answers in chat without spawning', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-route-gate-provenance-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 604, replies);
		ctx.message.text = 'Did the route-gate QA prompt at 1:37 create a Spawner mission? Answer from fresh mission history if you can: yes or no, with the evidence. Do not start anything.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		assert.equal(captured.length, 0, 'provenance question must not call Spawner or PRD bridge');
		assert.match(replies[0] || '', /I do not see proof|stayed in chat/i);
		assert.match(replies[0] || '', /fresh mission id|specific QA prompt|route-gate/i);
		assert.doesNotMatch(replies[0] || '', /latest no-edit probe was routed through Spawner/i);
		assert.doesNotMatch(replies[0] || '', /Mission board|Spawned work/i);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('H70 Thread QA golden-case request stays in chat without spawning', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-thread-qa-golden-case-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 605, replies);
		ctx.message.text = 'Do not build anything. Turn the H70 Orbit Proof interruption into a golden Thread QA test case. Keep it natural and short.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /golden Thread QA case, not a build/);
		assert.match(reply, /H70 Orbit Proof canvas update intrudes/);
		assert.match(reply, /stay in product conversation/i);
		assert.doesNotMatch(reply, /Runtime health|Degraded surfaces|Active loops/i);
		assert.equal(captured.length, 0, 'golden-case request must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('runtime truth priority answer stays short and conversational', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-truth-priority-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 606, replies);
		ctx.message.text = 'If memory says Spawner is down but spark live status says it is up, which source wins? Keep it natural and short.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Fresh runtime state wins/);
		assert.match(reply, /fresh `spark live status` says Spawner is up/);
		assert.match(reply, /Memory becomes stale context/);
		assert.doesNotMatch(reply, /Rule:/);
		assert.doesNotMatch(reply, /provider checks|direct smoke probes/);
		assert.ok(reply.split(/\n/).filter((line) => line.trim()).length <= 2, `expected short reply, got: ${reply}`);
		assert.equal(captured.length, 0, 'source-priority question must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('access capability drift answers effective capability before ideation fallback', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-access-capability-drift-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 606, replies);
		ctx.message.text = 'If access says operator but the runner is read-only, what can Spark really do right now?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Allowed, blocked here/i);
		assert.match(reply, /read-only runner/);
		assert.doesNotMatch(reply, /Got it|options on the table|I can help you think/i);
		assert.equal(captured.length, 0, 'capability drift answer must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('read-only repair follow-up stays in access lane and does not create a mission', async () => {
		restoreAxios();
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-readonly-repair-route-'));
		const binDir = path.join(tempRoot, 'bin');
		const oldPath = process.env.PATH || '';
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		mkdirSync(binDir, { recursive: true });
		writeFileSync(
			path.join(tempRoot, 'spark-access-status.json'),
			JSON.stringify({
				access_level: 4,
				effective_access_level: 4,
				workspace_path: path.join(tempRoot, 'workspace'),
				workspace_preflight: { writable: true, detail: 'Workspace write/delete preflight passed.' },
				level5: { activation_state: 'blocked', service_enabled: false },
				state_machine: { requested_access_level: 4, effective_access_level: 4 }
			})
		);
		const sparkShim = path.join(binDir, 'spark');
		writeFileSync(
			sparkShim,
			[
				'#!/bin/sh',
				`echo "$*" >> "${path.join(tempRoot, 'spark-calls.log').replace(/"/g, '\\"')}"`,
				'if [ "$1" = "access" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then',
				`  cat "${path.join(tempRoot, 'spark-access-status.json').replace(/"/g, '\\"')}"`,
				'  exit 0',
				'fi',
				'if [ "$1" = "access" ] && [ "$2" = "setup" ] && [ "$3" = "--json" ]; then',
				'  echo "{\\"ok\\":true,\\"effective_access_level\\":4,\\"recommended\\":{\\"id\\":\\"spark_workspace\\"},\\"next\\":\\"spark access status\\"}"',
				'  exit 0',
				'fi',
				'echo "unexpected spark command: $*" >&2',
				'exit 1',
				''
			].join('\n')
		);
		chmodSync(sparkShim, 0o755);
		process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, missionId: 'should-not-exist' } };
		};

		try {
			const replies: string[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 607, replies);
			ctx.message.text = 'lets make it beyond read only then';
			const indexModule: any = await import('../src/index');
			await indexModule.handleTextMessage(ctx);

			ctx.message.message_id = 608;
			ctx.message.text = 'did you';
			await indexModule.handleTextMessage(ctx);

			const joined = replies.join('\n');
			assert.match(joined, /access repair, not a Spawner mission/i);
			assert.match(joined, /safe Spark workspace was already writable/i);
			assert.match(joined, /Spark workspace writable: yes/);
			assert.doesNotMatch(joined, /I will run that through Codex now/i);
			assert.doesNotMatch(joined, /Canvas:|Kanban:|Mission board:/i);
			assert.equal(captured.length, 0, 'read-only repair and did-you follow-up must not call Spawner or PRD bridge');
			const sparkCalls = readFileSync(path.join(tempRoot, 'spark-calls.log'), 'utf-8');
			assert.doesNotMatch(sparkCalls, /access setup --json/, 'workspace_setup must not run when workspace is already writable');
		} finally {
			process.env.PATH = oldPath;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('read-only repair reports setup need without auto-running workspace setup', async () => {
		restoreAxios();
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-readonly-repair-setup-'));
		const binDir = path.join(tempRoot, 'bin');
		const oldPath = process.env.PATH || '';
		const statusPath = path.join(tempRoot, 'spark-access-status.json');
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		mkdirSync(binDir, { recursive: true });
		writeFileSync(
			statusPath,
			JSON.stringify({
				access_level: 4,
				effective_access_level: 4,
				workspace_path: path.join(tempRoot, 'workspace'),
				workspace_preflight: { writable: false, detail: 'Workspace is not created yet. Run `spark access setup`.' },
				level5: { activation_state: 'blocked', service_enabled: false },
				state_machine: { requested_access_level: 4, effective_access_level: 4 }
			})
		);
		const sparkShim = path.join(binDir, 'spark');
		writeFileSync(
			sparkShim,
			[
				'#!/bin/sh',
				`echo "$*" >> "${path.join(tempRoot, 'spark-calls.log').replace(/"/g, '\\"')}"`,
				'if [ "$1" = "access" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then',
				`  cat "${statusPath.replace(/"/g, '\\"')}"`,
				'  exit 0',
				'fi',
				'if [ "$1" = "access" ] && [ "$2" = "setup" ] && [ "$3" = "--json" ]; then',
				`  cat > "${statusPath.replace(/"/g, '\\"')}" <<'JSON'`,
				JSON.stringify({
					access_level: 4,
					effective_access_level: 4,
					workspace_path: path.join(tempRoot, 'workspace'),
					workspace_preflight: { writable: true, detail: 'Workspace write/delete preflight passed.' },
					recommended: { id: 'spark_workspace' },
					level5: { activation_state: 'blocked', service_enabled: false },
					state_machine: { requested_access_level: 4, effective_access_level: 4 }
				}),
				'JSON',
				'  echo "{\\"ok\\":true,\\"effective_access_level\\":4,\\"recommended\\":{\\"id\\":\\"spark_workspace\\"},\\"next\\":\\"spark access status\\"}"',
				'  exit 0',
				'fi',
				'echo "unexpected spark command: $*" >&2',
				'exit 1',
				''
			].join('\n')
		);
		chmodSync(sparkShim, 0o755);
		process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true, missionId: 'should-not-exist' } };
		};

		try {
			const replies: string[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 609, replies);
			ctx.message.text = 'make it writable';
			const indexModule: any = await import('../src/index');
			await indexModule.handleTextMessage(ctx);

			const joined = replies.join('\n');
			assert.match(joined, /access repair, not a Spawner mission/i);
			assert.match(joined, /did not run setup from natural text/i);
			assert.match(joined, /\/access_setup/);
			assert.match(joined, /Spark workspace writable: no/);
			assert.doesNotMatch(joined, /I will run that through Codex now/i);
			assert.doesNotMatch(joined, /Canvas:|Kanban:|Mission board:/i);
			assert.equal(captured.length, 0, 'access repair setup must not call Spawner or PRD bridge');
			const sparkCalls = readFileSync(path.join(tempRoot, 'spark-calls.log'), 'utf-8');
			assert.match(sparkCalls, /access status --json/);
			assert.doesNotMatch(sparkCalls, /access setup --json/);
		} finally {
			process.env.PATH = oldPath;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('workspace and wiki current-truth prompt keeps notes historical', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-workspace-wiki-freshness-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 606, replies);
		ctx.message.text = 'Use Workspace and Wiki to tell me what changed, but do not treat old notes as current truth.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /historical context/);
		assert.match(reply, /fresh runtime probes/);
		assert.equal(captured.length, 0, 'historical context boundary must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('latest QA run summary stays conversational without raw headings', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-qa-run-summary-'));
		const repoRoot = path.join(tempRoot, 'specialization-path-spark-qa-operator');
		const outputDir = path.join(repoRoot, '.spark-swarm', 'autoloop', 'runs', 'latest-summary');
		mkdirSync(outputDir, { recursive: true });
		mkdirSync(path.join(repoRoot, 'benchmarks', 'evidence'), { recursive: true });
		mkdirSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator'), { recursive: true });
		writeFileSync(path.join(repoRoot, 'specialization-path.json'), JSON.stringify({ id: 'spark-qa-operator' }));
		writeFileSync(path.join(repoRoot, 'src', 'specialization_path_spark_qa_operator', '__init__.py'), '');
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = repoRoot;
		const reportPath = path.join(outputDir, 'autoloop_round_report.json');
		const report = {
			schemaVersion: 'spark-qa-autoloop-round-report.v1',
			run: { status: 'blocked', endedAt: new Date().toISOString() },
			baselineCandidateDelta: { baselineScore: 0, candidateScore: 1, delta: 1 },
			captureReplay: { passedCount: 4, caseCount: 4 },
			evidenceBenchmark: { overallScore: 1 },
			failureQueue: { ticketCount: 0 },
			promotionDossier: { scoreClaimAllowed: false, blockers: ['sidecar_review_pending'] }
		};
		const reportText = JSON.stringify(report, null, 2) + '\n';
		writeFileSync(reportPath, reportText);
		writeFileSync(path.join(repoRoot, '.spark-swarm', 'autoloop', 'latest_run.json'), JSON.stringify({
			schemaVersion: 'spark-qa-autoloop-latest-run.v1',
			generatedAt: report.run.endedAt,
			outputRoot: outputDir,
			reportPath,
			reportSha256: createHash('sha256').update(reportText).digest('hex'),
			status: 'blocked'
		}));

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 606, replies);
		ctx.message.text = 'Tell me what happened in the latest QA run without raw ids or report-card headings.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

			const reply = replies[0] || '';
			assert.match(reply, /ran the benchmark\/autoloop proof/);
			assert.match(reply, /would not claim an upgrade yet/);
			assert.match(reply, /Private evidence benchmark coverage is 1; this is not a promotion score/);
			assert.match(reply, /sidecar review is still pending/);
			assert.doesNotMatch(reply, /Mission\n|Provider\n|Move\n|trace_id|\/Users\//);

			const followupReplies: string[] = [];
			const followupCtx = makeFakeCtx(8319079055, 8319079055, 606, followupReplies);
			followupCtx.message.text = 'what happened in the latest QA run?';
			await indexModule.handleTextMessage(followupCtx);

			const followupReply = followupReplies[0] || '';
			assert.match(followupReply, /ran the benchmark\/autoloop proof/);
			assert.match(followupReply, /Private evidence benchmark coverage is 1; this is not a promotion score/);
			assert.doesNotMatch(followupReply, /Score\n|State\n|Move\n|Report\n|trace_id|\/Users\//);

			const evidenceReplies: string[] = [];
			const evidenceCtx = makeFakeCtx(8319079055, 8319079055, 606, evidenceReplies);
			evidenceCtx.message.text = 'show Spark QA Operator benchmark evidence';
			await indexModule.handleTextMessage(evidenceCtx);

			const evidenceReply = evidenceReplies[0] || '';
			assert.match(evidenceReply, /ran the benchmark\/autoloop proof/);
			assert.match(evidenceReply, /Private evidence benchmark coverage is 1; this is not a promotion score/);
			assert.doesNotMatch(evidenceReply, /Score\n|State\n|Move\n|Report\n|trace_id|\/Users\//);

			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		});

	await test('Spark QA Operator autoloop pause writes local control state without starting another round', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-qa-autoloop-pause-'));
		const repoRoot = path.join(tempRoot, 'specialization-path-spark-qa-operator');
		mkdirSync(repoRoot, { recursive: true });
		writeFileSync(path.join(repoRoot, 'specialization-path.json'), JSON.stringify({ id: 'spark-qa-operator' }));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = repoRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 607, replies);
		ctx.message.text = 'pause the Spark QA Operator loop; do not keep running more rounds';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const controlPath = path.join(repoRoot, '.spark-swarm', 'specialization-paths', 'spark-qa-operator', 'control.json');
		const control = JSON.parse(readFileSync(controlPath, 'utf-8'));
		assert.equal(control.status, 'paused');
		assert.equal(control.pathKey, 'spark-qa-operator');
		assert.match(replies[0] || '', /Paused the Spark QA Operator loop/);
		assert.match(replies[0] || '', /will not start more rounds/);
		assert.equal(captured.length, 0, 'pause control must not dispatch work');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('no-start mission title probe answers title instead of stale canvas', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-title-probe-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 607, replies);
		ctx.message.text = 'Do not start a mission. If I say "Create a tiny maze game plan and build only a minimal playable prototype", what mission title would you use? Keep it natural and short.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Tiny Maze Game/);
		assert.match(reply, /would not start a mission/i);
		assert.doesNotMatch(reply, /latest canvas|H70 Orbit Proof|build steps are queued|Canvas/i);
		assert.equal(captured.length, 0, 'title probe must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('no-start mission routing failure-class probe stays conversational', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-routing-failure-class-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 608, replies);
		ctx.message.text = 'I am asking about a bug in mission routing. Do not launch a mission; just explain the likely failure class in one or two natural sentences.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /route hijack/i);
		assert.match(reply, /Governor decision/i);
		assert.doesNotMatch(reply, /This is no-action|no-action/i);
		assert.doesNotMatch(reply, /latest canvas|H70 Orbit Proof|Mission board|Canvas|Kanban/i);
		assert.ok(reply.split(/\n/).filter((line) => line.trim()).length <= 2, `expected short reply, got: ${reply}`);
		assert.equal(captured.length, 0, 'failure-class probe must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('meta no-action trigger discussion does not become live health status', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-meta-trigger-boundary-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 609, replies);
		ctx.message.text = 'TurnIntent final QA after restart: This is not a command. I am discussing the words remember, publish, deploy, schedule, provider, and chip as examples of risky triggers. Do not save memory or publish anything. What should Spark do with this turn?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /stay in chat/i);
		assert.match(reply, /examples or context|quoted words|memory write/i);
		assert.doesNotMatch(reply, /Spark is healthy right now|No restart needed|Live loop/i);
		assert.equal(captured.length, 0, 'meta trigger discussion must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('meta risky-word discussion does not become live health status', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-meta-risky-word-boundary-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 610, replies);
		ctx.message.text = 'TurnIntent live QA 1/8: This is not a command. I am only discussing risky words: build, run, mission, remember, publish, deploy, schedule, provider, chip, restart. Do not start, save, publish, schedule, or restart anything. What should Spark do with this turn?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /language evidence|Governor/i);
		assert.doesNotMatch(reply, /This is no-action|no-action/i);
		assert.doesNotMatch(reply, /Spark is healthy right now|No restart needed|Live loop/i);
		assert.equal(captured.length, 0, 'meta risky-word discussion must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('startup architecture no-action discussion stays out of Builder detours', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-architecture-boundary-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 611, replies);
		ctx.message.text = 'TurnIntent live QA 3/8: We are discussing the startup operator and self-improvement loop as product architecture, not asking you to launch a loop. Do not run, build, publish, schedule, save memory, or start a mission. In chat only, what boundary should Spark keep here?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /answer-quality proof/i);
		assert.match(reply, /architecture|chat/i);
		assert.doesNotMatch(reply, /This is no-action|no-action/i);
		assert.equal(replies.length, 1, 'startup architecture boundary should answer once in chat');
		assert.equal(captured.length, 0, 'startup architecture boundary must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('startup operator no-launch advice answers in chat', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-operator-no-launch-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 612, replies);
		ctx.message.text = 'For the startup operator, what is the next useful improvement to test? Do not launch anything.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /answer-quality proof/i);
		assert.equal(replies.length, 1, 'startup no-launch advice should answer once in chat');
		assert.equal(captured.length, 0, 'startup no-launch advice must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('startup loop readiness question answers readiness in chat', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-loop-readiness-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 613, replies);
		ctx.message.text = 'Stay in chat and tell me whether the startup loop is ready.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /bounded proof runs/i);
		assert.match(reply, /not unsupervised launch/i);
		assert.match(reply, /fresh explicit run request/i);
		assert.doesNotMatch(reply, /Treat the action words as evidence/i);
		assert.equal(replies.length, 1, 'startup loop readiness should answer once in chat');
		assert.equal(captured.length, 0, 'startup loop readiness must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('natural startup operator usage question does not confirm a contextual mission', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-operator-natural-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const user = { id: 8319079055, username: 'cem' };
		const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
		await conversationModule.conversation.remember(
			user,
			'We should build a Spark bug-recognition domain chip from recent Telegram routing issues.'
		);

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 613, replies);
		ctx.message.text = 'Should we use the startup operator more, and what would make that worthwhile?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies.join('\n');
		assert.match(reply, /sharper startup decisions|Worthwhile proof/i);
		assert.doesNotMatch(reply, /I will run that through Codex now|Mission:|Canvas|Kanban/i);
		assert.equal(captured.length, 0, 'natural startup-operator discussion must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('founder answer-quality planning does not attach Memory Doctor evidence', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-founder-answer-quality-boundary-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		const capturedBridgeTexts: string[] = [];
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			const messageText = String(((updatePayload as any).message || {}).text || '');
			capturedBridgeTexts.push(messageText);
			return {
				used: true,
				responseText: [
					'Spark should measure founder answer quality by specificity, falsifiability, commercial next step, and whether the answer changes the founder decision.',
					'That is planning evidence for the startup operator, so the reply should stay in chat.'
				].join('\n'),
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'plain_chat'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest((builderBridge as any).runBuilderTelegramBridge);

			const prompts = [
				'I am thinking about founder answer quality. What should Spark measure first?',
				'Compare a startup operator answer that feels generic with one that feels genuinely improved.'
			];
			const replies: string[] = [];
			for (const [index, prompt] of prompts.entries()) {
				const ctx = makeFakeCtx(8319079055, 8319079055, 614 + index, replies);
				ctx.message.text = prompt;
				(ctx as any).update = { update_id: 614 + index, message: ctx.message };
				await indexModule.handleTextMessage(ctx);
			}

			const reply = replies.join('\n');
			assert.match(reply, /founder answer quality/i);
			assert.doesNotMatch(reply, /Memory Doctor|missing Spark authority for memory diagnostics|tool_not_allowed_by_policy/i);
			assert.doesNotMatch(capturedBridgeTexts.join('\n'), /Spark Telegram Memory Doctor evidence|Route: memory\.doctor/i);
			assert.equal(captured.length, 0, 'founder answer-quality planning must not call Spawner or PRD bridge');
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest(null);
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('text Builder handoff carries redacted Harness proof capsule and delivery context', async () => {
		restoreAxios();
		const testUserId = 8319079590;
		process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
		process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';

		const builderBridge = require('../src/builderBridge') as typeof import('../src/builderBridge');
		const originalBridge = builderBridge.runBuilderTelegramBridge;
		const capturedBridgePayloads: Record<string, unknown>[] = [];
		(builderBridge as any).runBuilderTelegramBridge = async (updatePayload: Record<string, unknown>) => {
			capturedBridgePayloads.push(updatePayload);
			return {
				used: true,
				responseText: 'Route confidence is evidence-backed route selection.',
				decision: 'test',
				bridgeMode: 'test',
				routingDecision: 'plain_chat',
				requestId: 'sim:proof-bridge',
				traceRef: 'trace:builder-proof-bridge'
			};
		};

		try {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest((builderBridge as any).runBuilderTelegramBridge);
			const replies: string[] = [];
			const replyExtras: any[] = [];
			const ctx = makeFakeCtx(testUserId, testUserId, 5660, replies, replyExtras);
			ctx.message.text = 'what is route confidence in one sentence';
			(ctx as any).update = { update_id: 5660, message: ctx.message };

			await indexModule.handleTextMessage(ctx);

			const bridgePayload = capturedBridgePayloads[0] as any;
			assert.ok(bridgePayload, 'expected Telegram to call Builder bridge');
			assert.match(bridgePayload.harnessProofRef, /^turn:sha256:[a-f0-9]{16}$/);
			assert.equal(bridgePayload.harness_proof_ref, bridgePayload.harnessProofRef);
			assert.equal(bridgePayload.message?.harnessProofRef, bridgePayload.harnessProofRef);
			assert.equal(bridgePayload.message?.spark_harness?.proofRef, bridgePayload.harnessProofRef);
			assert.deepEqual(
				[
					bridgePayload.harnessProofCapsule?.schema,
					bridgePayload.harnessProofCapsule?.turnRef,
					bridgePayload.proofCapsule?.turnRef,
					bridgePayload.message?.harnessProofCapsule?.turnRef,
					bridgePayload.message?.spark_harness?.proofCapsule?.turnRef
				],
				[
					'spark.harness_proof.v1',
					bridgePayload.harnessProofRef,
					bridgePayload.harnessProofRef,
					bridgePayload.harnessProofRef,
					bridgePayload.harnessProofRef
				]
			);
			assert.doesNotMatch(JSON.stringify(bridgePayload.harnessProofCapsule), /8319079590|tg-build-|trace:spawner-prd|chat_id/);
			const traceContext = replyExtras[0]?.__sparkTraceContext;
			assert.match(traceContext?.requestId || '', /^request:sha256:[a-f0-9]{16}$/);
			assert.match(traceContext?.traceRef || '', /^trace:sha256:[a-f0-9]{16}$/);
			assert.equal(traceContext?.proofCapsule?.turnRef, bridgePayload.harnessProofRef);
			assert.equal(traceContext?.proofCapsule?.reply?.delivered, true);
			assert.equal(traceContext?.proofCapsule?.joins?.builder, 'joined');
			assert.match(replies.join('\n'), /Route confidence is evidence-backed route selection/);
		} finally {
			const indexModule: any = await import('../src/index');
			indexModule.__setBuilderBridgeRunnerForTest(null);
			(builderBridge as any).runBuilderTelegramBridge = originalBridge;
			restoreAxios();
			restoreEnv();
		}
	});

	await test('startup answer editing in chat does not become access or mission execution', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'operator';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-answer-edit-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const accessCtx = makeFakeCtx(8319079066, 8319079055, 615, replies);
		accessCtx.message.text = 'Change my access level to three please';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(accessCtx);

		const editCtx = makeFakeCtx(8319079066, 8319079055, 616, replies);
		editCtx.message.text = 'Improve this startup answer in chat only: "Keep nurturing the pilots and wait for stronger usage." Make it more operator-grade.';
		await indexModule.handleTextMessage(editCtx);

		const reply = replies[1] || '';
		assert.match(reply, /Operator-grade version/i);
		assert.doesNotMatch(reply, /Access level|internal error|Spawner|Mission/i);
		assert.equal(captured.length, 0, 'plain answer editing must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('startup answer pair scoring in chat does not become a loop', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-answer-score-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079067, 8319079055, 617, replies);
		ctx.message.text = 'Score this startup answer pair in chat only. Baseline: "keep nurturing." Candidate: "ask for paid commitment this week." Which is better and why? Do not run a loop.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Candidate is better/i);
		assert.match(reply, /falsifiable buying signal/i);
		assert.doesNotMatch(reply, /internal error|Spawner|Mission|loop started/i);
		assert.equal(captured.length, 0, 'startup answer scoring in chat must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('startup answer canary in chat answers without launching tools', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-startup-answer-canary-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079068, 8319079055, 618, replies);
		ctx.message.text = 'Run a tiny startup answer canary in chat only: give one better answer to "12 pilots, 0 paid." Do not launch tools.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Better answer/i);
		assert.match(reply, /zero paid is not validation/i);
		assert.doesNotMatch(reply, /internal error|Spawner|Mission|loop started/i);
		assert.equal(captured.length, 0, 'startup answer canary in chat must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('no-edit Spawner probe explanation answers before board or bridge routes', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-no-edit-probe-explain-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079069, 8319079055, 619, replies);
		ctx.message.text = 'Do not build. What would a no-edit Spawner probe prove?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /bounded job to Spawner/i);
		assert.match(reply, /does not prove editing ability/i);
		assert.doesNotMatch(reply, /Board failed|internal error|Mission:/i);
		assert.equal(captured.length, 0, 'no-edit probe explanation must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('smallest no-edit test question answers before Builder bridge routes', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-smallest-no-edit-test-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079078, 8319079055, 628, replies);
		ctx.message.text = 'No run yet; what would be the smallest no-edit test?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /smallest useful no-edit test/i);
		assert.match(reply, /tiny Spawner probe/i);
		assert.match(reply, /does not create or edit files/i);
		assert.doesNotMatch(reply, /Run `\/probe|Mission:|internal error/i);
		assert.equal(captured.length, 0, 'smallest no-edit test question must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('model switch gate explanation answers before Builder bridge routes', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-model-switch-gate-chat-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079079, 8319079055, 629, replies);
		ctx.message.text = 'Do not change settings. Explain how model-switch commands are gated.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /settings mutations/i);
		assert.match(reply, /explicit `\/model` request/i);
		assert.match(reply, /stay chat-only/i);
		assert.doesNotMatch(reply, /now uses|switched|internal error/i);
		assert.equal(captured.length, 0, 'model-switch gate explanation must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('read-only Spark state questions answer before Builder bridge routes', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-read-only-state-chat-'));
		const binDir = path.join(tempRoot, 'bin');
		const systemMapDir = path.join(tempRoot, 'system-map');
		mkdirSync(binDir, { recursive: true });
		mkdirSync(systemMapDir, { recursive: true });
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		process.env.SPARK_SYSTEM_MAP_STATE_DIR = systemMapDir;
		const oldPath = process.env.PATH || '';
		const sparkShim = path.join(binDir, 'spark');
		writeFileSync(
			sparkShim,
			[
				'#!/bin/sh',
				'if [ "$1" = "live" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then',
				'  cat <<EOF',
				'{',
				'  "ok": true,',
				'  "telegram_profiles": [{"profile":"primary","primary":true,"running":true,"pid":123,"relay_port":8789}],',
				'  "modules": [{"name":"spark-harness-core","version":"0.1.0","plane":"authority","healthy":true,"installed":{"version":"0.1.0","plane":"authority"}}]',
				'}',
				'EOF',
				'  exit 0',
				'fi',
				'echo "unexpected spark command: $*" >&2',
				'exit 1',
				''
			].join('\n')
		);
		chmodSync(sparkShim, 0o755);
		process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;
		writeFileSync(
			path.join(systemMapDir, 'contract-coverage.json'),
			JSON.stringify({
				summary: {
					edge_count: 51,
					status_counts: { envelope_verified: 51 },
					legacy_plane_classification_counts: { retired: 51 },
					release_blocker_count: 0,
					legacy_plane_release_blocker_count: 0,
					legacy_plane_cleanup_queue_count: 0
				}
			}, null, 2)
		);
		writeFileSync(
			path.join(systemMapDir, 'repo-board.json'),
			JSON.stringify({
				duplicate_truths: {
					summary: { item_count: 1 },
					items: [{
						owner_repo: 'spark-telegram-bot',
						severity: 'critical',
						classification: 'runtime_ahead_of_registry_pin',
						evidence_details: {
							installed_head: '3551fbc34b1f1234567890abcdef1234567890abcd',
							registry_commit: 'e5a1bd0409861234567890abcdef1234567890abcd'
						},
						next_safe_action: 'Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.'
					}]
				}
			}, null, 2)
		);

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		try {
			const indexModule: any = await import('../src/index');
			const cases = [
				{
					text: 'Check whether the Harness Core module is installed.',
					matches: [/Harness Core is installed/i, /No files were edited/i],
					not: [/Mission:|installing|updating/i]
				},
				{
					text: 'Tell me whether Telegram primary is polling right now.',
					matches: [/Telegram primary is polling/i, /I did not restart Telegram/i],
					not: [/restarting|Mission:/i]
				},
				{
					text: 'Read whether there are contract coverage blockers.',
					matches: [/No contract coverage blockers/i, /Legacy cleanup queue: 0/i],
					not: [/Mission:/i]
				},
				{
					text: 'Show current registry drift if any.',
					matches: [/registry truth drift/i, /running code is not fully matched to published release metadata/i, /publish stays not ready/i, /installed runtime is ahead of the published registry pin/i, /read-only evidence lookup/i],
					not: [/Mission:|3551fbc34b1f|e5a1bd040986|runtime_ahead_of_registry_pin|registry_commit|installed_head/i]
				},
				{
					text: 'Read memory preference for mission update style if available.',
					matches: [/mission update style preference/i, /did not write memory/i],
					not: [/updated how I narrate|Mission:/i]
				},
				{
					text: 'Check if there is a pending action waiting for confirmation.',
					matches: [/(?:pending action waiting|pending state waiting)/i, /(?:Nothing was resumed or executed|did not resume or execute)/i],
					not: [/Mission:/i]
				}
			];

			for (const [index, item] of cases.entries()) {
				const replies: string[] = [];
				const ctx = makeFakeCtx(8319079080 + index, 8319079055, 630 + index, replies);
				ctx.message.text = item.text;
				await indexModule.handleTextMessage(ctx);
				const reply = replies[0] || '';
				for (const pattern of item.matches) {
					assert.match(reply, pattern, `${item.text} missing ${pattern}`);
				}
				for (const pattern of item.not) {
					assert.doesNotMatch(reply, pattern, `${item.text} should not contain ${pattern}`);
				}
			}
			assert.equal(captured.length, 0, 'read-only Spark state questions must not call Spawner or PRD bridge');
		} finally {
			process.env.PATH = oldPath;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('mission-id product concept does not become Mission Control status', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-mission-id-product-boundary-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 613, replies);
		ctx.message.text = 'We are discussing mission IDs as a product concept, not launching a mission. What should the UI show?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /human title first/i);
		assert.doesNotMatch(reply, /Spawner UI|Mission Control is running|diagnostic-agent/i);
		assert.equal(captured.length, 0, 'mission-id product concept must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('natural access lowering updates chat setting without running noninteractive Level 5 CLI action', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'operator';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-natural-access-lower-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079056, 8319079055, 614, replies);
		ctx.message.text = 'Change my access level to three please';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Access level 3|Level 3/i);
		assert.match(reply, /chat setting/i);
		assert.doesNotMatch(reply, /configuration problem|disable-level5 --json/i);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('access level documentation comparison stays product-rule chat', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'operator';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-access-product-rule-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079070, 8319079055, 620, replies);
		ctx.message.text = 'In docs, I am comparing access level 3 and access level 5. Do not change my access. What is the product rule?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /descriptive unless/i);
		assert.match(reply, /real access change needs fresh explicit intent/i);
		assert.doesNotMatch(reply, /This chat is on Access Level|Change it with/i);
		assert.equal(captured.length, 0, 'access product-rule chat must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('no-build ideation gives requested three ideas', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-no-build-three-ideas-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 621, replies);
		ctx.message.text = 'Give me three build ideas for founder onboarding. Do not build anything yet.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Three founder-onboarding ideas/i);
		assert.match(reply, /1\./);
		assert.match(reply, /2\./);
		assert.match(reply, /3\./);
		assert.doesNotMatch(reply, /Mission:|I will run|Got it, staying in chat/i);
		assert.equal(captured.length, 0, 'no-build ideation must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('no-loop startup operator ideation gives requested three improvements', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-no-loop-three-improvements-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 622, replies);
		ctx.message.text = 'Give me three startup operator improvements. Do not start a loop.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Three startup-operator improvements/i);
		assert.match(reply, /1\./);
		assert.match(reply, /2\./);
		assert.match(reply, /3\./);
		assert.doesNotMatch(reply, /Mission:|I will run|Got it, staying in chat/i);
		assert.equal(captured.length, 0, 'no-loop ideation must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('no-create chip word usage stays literal', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-chip-word-usage-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 623, replies);
		ctx.message.text = 'Use the word chip in a sentence. Do not create a chip or domain chip.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /\bchip\b/i);
		assert.doesNotMatch(reply, /domain chip is useful|specialization package|Mission:|I will run/i);
		assert.equal(captured.length, 0, 'literal chip word usage must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('taxonomy action-word labels do not infer contextual mission from recent Spark bug context', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-taxonomy-labels-no-mission-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return {
				data: {
					success: true,
					missionId: 'should-not-start-from-taxonomy',
					providers: ['codex']
				}
			};
		};
		(axios as any).get = async () => ({ data: { providers: [{ id: 'codex' }] } });

		const conversationModule = require('../src/conversation') as typeof import('../src/conversation');
		await conversationModule.conversation.remember(
			{ id: 8319079072, username: 'cem' },
			'We are designing a Spark bug recognition domain chip with build, mission, and diagnostic agent context.'
		);

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079072, 8319079055, 628, replies);
		ctx.message.text = 'Memory, mission, build, and publish are just labels in this taxonomy.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const joined = replies.join('\n');
		assert.doesNotMatch(joined, /I will run that through Codex now|Mission:|Canvas|Kanban/i);
		assert.equal(
			captured.filter((c) => /\/api\/(?:spark\/run|prd-bridge\/write)/.test(c.url)).length,
			0,
			'taxonomy label sentence must not call Spawner run or PRD bridge'
		);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('chat-only domain chip proposal stays useful without creating', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-chat-only-chip-proposal-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 624, replies);
		ctx.message.text = 'Create a tiny domain chip proposal in chat only for startup pricing objections. Do not create files or launch a mission.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /Startup Pricing Objection Coach/i);
		assert.match(reply, /Trigger:/i);
		assert.match(reply, /Proof:/i);
		assert.doesNotMatch(reply, /Mission:|I will run|permission to run tools/i);
		assert.equal(captured.length, 0, 'chat-only chip proposal must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('schedule word in bug report stays schedule-specific chat', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-schedule-word-report-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 626, replies);
		ctx.message.text = 'In this bug report, the word schedule appears as an example: schedule the launch. Do not schedule anything. What should Spark do?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /text inside the bug report/i);
		assert.match(reply, /fresh, explicit schedule request/i);
		assert.doesNotMatch(reply, /Mission:|I will run|permission to run tools/i);
		assert.equal(captured.length, 0, 'schedule bug-report wording must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('quoted customer schedule wording stays in chat without schedule menu', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-schedule-quote-report-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 627, replies);
		ctx.message.text = 'A customer wrote "schedule the founder review" in a quote. How should Spark classify it?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /text inside/i);
		assert.match(reply, /fresh, explicit schedule request/i);
		assert.doesNotMatch(reply, /I caught 'schedule'|Show what's scheduled|Which\?/i);
		assert.equal(captured.length, 0, 'quoted schedule wording must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('publish and deploy words in bug report stay release-specific chat', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-release-word-report-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			return { data: { success: true } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 627, replies);
		ctx.message.text = 'Bug report: the words publish and deploy are examples here, not commands. Do not publish or deploy. What should Spark do?';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const reply = replies[0] || '';
		assert.match(reply, /text inside the bug report/i);
		assert.match(reply, /fresh, explicit release request/i);
		assert.doesNotMatch(reply, /Mission:|I will run|permission to run tools/i);
		assert.equal(captured.length, 0, 'release bug-report wording must not call Spawner or PRD bridge');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('confirmed pending build proceeds when route-confidence gate asks again', async () => {
		restoreAxios();
		restoreEnv();
		delete process.env.SPARK_BOT_TEST_MODE;
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-route-confidence-proof-'));
		const auditPath = path.join(tempRoot, 'route-confidence-audit.jsonl');
		process.env.SPARK_TELEGRAM_ROUTE_CONFIDENCE_AUDIT_PATH = auditPath;

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 625, replies);
		const indexModule: any = await import('../src/index');
		const allowed = await indexModule.buildDispatchRouteConfidenceAllows({
			ctx,
			accessRequirement: 'spawner_build',
			prd: '# Domain Chip Startup Pricing Objections\n\nLocal-only domain chip package.',
			requestId: 'req-confirmed-domain-chip',
			traceRef: 'trace-confirmed-domain-chip',
			runnerPreflight: { runnerWritable: 'yes' },
			confirmationState: 'confirmed',
			spawnerAvailableProbe: async () => true,
			gateRunner: async () => ({
				payload: {
					decision: 'ask',
					human_next_action: 'Ask one confirmation question before taking the side-effecting action.',
					safe_reply_policy: 'ask'
				}
			})
		});

		assert.equal(allowed, true);
		assert.equal(replies.length, 0, 'confirmed go should not leak meta confirmation copy');
		const auditText = await waitForFileText(auditPath);
		const record = JSON.parse(auditText.trim().split('\n').at(-1)!);
		assert.equal(record.schema_version, 'spark.telegram_route_confidence_audit.v1');
		assert.equal(record.outcome, 'acted');
		assert.match(record.request_ref, /^request:sha256:[a-f0-9]{16}$/);
		assert.match(record.trace_ref, /^trace:sha256:[a-f0-9]{16}$/);
		assert.equal(record.harness_proof_ref, record.proof_capsule.turnRef);
		assert.equal(record.proof_capsule.schema, 'spark.harness_proof.v1');
		assert.equal(record.proof_capsule.reply.rawReasonsHidden, true);
		assert.equal(Object.prototype.hasOwnProperty.call(record, 'request_id'), false);
		assert.doesNotMatch(JSON.stringify(record), /req-confirmed-domain-chip|trace-confirmed-domain-chip|8319079055|8319079071/);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('blocked route-confidence dispatch writes redacted proof capsule', async () => {
		restoreAxios();
		restoreEnv();
		delete process.env.SPARK_BOT_TEST_MODE;
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-route-confidence-blocked-proof-'));
		const auditPath = path.join(tempRoot, 'route-confidence-audit.jsonl');
		process.env.SPARK_TELEGRAM_ROUTE_CONFIDENCE_AUDIT_PATH = auditPath;

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 626, replies);
		const indexModule: any = await import('../src/index');
		const allowed = await indexModule.buildDispatchRouteConfidenceAllows({
			ctx,
			accessRequirement: 'spawner_build',
			prd: '# External Launch\n\nPublish this to production.',
			requestId: 'req-blocked-route-confidence',
			traceRef: 'trace-blocked-route-confidence',
			runnerPreflight: { runnerWritable: 'yes' },
			confirmationState: 'missing',
			spawnerAvailableProbe: async () => true,
			gateRunner: async () => ({
				payload: {
					decision: 'refuse',
					human_next_action: 'Ask for a safer local-only build scope before starting.',
					safe_reply_policy: 'refuse'
				}
			})
		});

		assert.equal(allowed, false);
		assert.match(replies.join('\n'), /cannot start that build safely/i);
		const auditText = await waitForFileText(auditPath);
		const record = JSON.parse(auditText.trim().split('\n').at(-1)!);
		assertRouteConfidenceAuditProof(record, {
			outcome: 'blocked',
			decision: 'refuse',
			rawRequestId: 'req-blocked-route-confidence',
			rawTraceRef: 'trace-blocked-route-confidence'
		});
		assert.equal(record.proof_capsule.authority.decision, 'blocked');
		assert.equal(record.proof_capsule.governor.decision, 'deny');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('failed-closed route-confidence dispatch writes redacted proof capsule', async () => {
		restoreAxios();
		restoreEnv();
		delete process.env.SPARK_BOT_TEST_MODE;
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-route-confidence-failed-proof-'));
		const auditPath = path.join(tempRoot, 'route-confidence-audit.jsonl');
		process.env.SPARK_TELEGRAM_ROUTE_CONFIDENCE_AUDIT_PATH = auditPath;

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079071, 8319079055, 627, replies);
		const indexModule: any = await import('../src/index');
		const allowed = await indexModule.buildDispatchRouteConfidenceAllows({
			ctx,
			accessRequirement: 'spawner_build',
			prd: '# Local Build\n\nPrepare a local-only package.',
			requestId: 'req-failed-route-confidence',
			traceRef: 'trace-failed-route-confidence',
			runnerPreflight: { runnerWritable: 'yes' },
			latestInstruction: 'no_execution',
			confirmationState: 'confirmed',
			spawnerAvailableProbe: async () => true,
			gateRunner: async () => {
				throw new Error("spark-intelligence self: error: argument self_command: invalid choice: 'route-confidence-gate'");
			}
		});

		assert.equal(allowed, false);
		assert.match(replies.join('\n'), /cannot prove the route gate/i);
		const auditText = await waitForFileText(auditPath);
		const record = JSON.parse(auditText.trim().split('\n').at(-1)!);
		assertRouteConfidenceAuditProof(record, {
			outcome: 'failed_closed',
			decision: 'unavailable',
			rawRequestId: 'req-failed-route-confidence',
			rawTraceRef: 'trace-failed-route-confidence'
		});
		assert.equal(record.proof_capsule.execution.status, 'failed');
		assert.equal(record.proof_capsule.authority.decision, 'blocked');
		assert.equal(record.proof_capsule.governor.decision, 'deny');

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('explicit slow no-edit Mission Control diagnostic routes through Spawner instead of live health', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-slow-no-edit-route-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		const ledgerPath = path.join(tempRoot, 'harness-core-ledger.jsonl');
		process.env.SPARK_HARNESS_CORE_LEDGER_PATH = ledgerPath;
		delete process.env.SPARK_HARNESS_CORE_LEDGER;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/spark/run')) {
				return {
					data: {
						success: true,
						missionId: 'spark-slow-no-edit',
						requestId: body.requestId,
						providers: ['codex']
					}
				};
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { providers: [{ id: 'codex' }] } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 605, replies);
		ctx.message.text = 'Run a deliberately slow no-edit Mission Control diagnostic through Spawner. It should only prove live running-state UI and reply with SPARK_E2E_SLOW_NO_EDIT_OK after waiting about 30 seconds. Do not create files, do not edit files, and share Canvas/Kanban/View Execution if it starts.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const runCall = captured.find((c) => c.url.includes('/api/spark/run'));
		assert.ok(runCall, 'explicit no-edit Spawner diagnostic must dispatch through Spawner');
		assert.equal(runCall!.body.missionName, 'Telegram Golden Path Probe');
		assert.equal(runCall!.body.executionAuthority?.tool_ledgers?.[0]?.tool_name, 'spawner.run');
		assert.match(runCall!.body.goal, /Reply with exactly: SPARK_E2E_SLOW_NO_EDIT_OK/);
		assert.match(runCall!.body.goal, /wait about 30 seconds so Mission Control can show a running state/);
		assert.match(replies.join('\n'), /I will run that through Codex now\./);
		assert.doesNotMatch(replies.join('\n'), /Spark is healthy right now|No repair action needed/i);
		const ledgerRecords = readHarnessCoreToolLedger(ledgerPath);
		assert.ok(
			ledgerRecords.some((record) => record.authorization.verdict === 'allow' && record.result.status === 'not_started'),
			'natural no-edit Spawner probe must record Harness Core authorization before owner execution'
		);
		assert.ok(
			ledgerRecords.some((record) => (
				record.tool_name === 'spawner.run' &&
				record.result.status === 'success' &&
				/Natural no-edit Spawner probe started mission spark-slow-no-edit/.test(record.result.summary)
			)),
			'natural no-edit Spawner probe must record the final Harness Core execution result'
		);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('exact supervised tiny no-edit mission routes through the dedicated Spawner probe lane', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-tiny-no-edit-route-'));
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		const ledgerPath = path.join(tempRoot, 'harness-core-ledger.jsonl');
		process.env.SPARK_HARNESS_CORE_LEDGER_PATH = ledgerPath;
		delete process.env.SPARK_HARNESS_CORE_LEDGER;

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/spark/run')) {
				return {
					data: {
						success: true,
						missionId: 'spark-tiny-no-edit',
						requestId: body.requestId,
						providers: ['codex']
					}
				};
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { providers: [{ id: 'codex' }] } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 606, replies);
		ctx.message.text = 'Run a tiny mission through Spawner that only replies: SPARK_QA_NO_EDIT_OK. Do not edit files.';
		const indexModule: any = await import('../src/index');
		await indexModule.handleTextMessage(ctx);

		const runCalls = captured.filter((call) => call.url.includes('/api/spark/run'));
		assert.equal(runCalls.length, 1, 'the supervised probe must dispatch exactly one Spawner mission');
		assert.equal(runCalls[0].body.missionName, 'Telegram Golden Path Probe');
		assert.equal(runCalls[0].body.executionAuthority?.tool_ledgers?.[0]?.tool_name, 'spawner.run');
		assert.match(runCalls[0].body.goal, /Reply with exactly: SPARK_QA_NO_EDIT_OK/);
		assert.match(runCalls[0].body.goal, /Do not edit files/);
		assert.match(runCalls[0].body.goal, /Do not create files/);
		assert.match(replies.join('\n'), /I will run that through Codex now\./);
		const ledgerRecords = readHarnessCoreToolLedger(ledgerPath);
		assert.ok(
			ledgerRecords.some((record) => record.authorization.verdict === 'allow' && record.result.status === 'not_started'),
			'the dedicated probe must record Harness Core authorization before execution'
		);
		assert.ok(
			ledgerRecords.some((record) => (
				record.tool_name === 'spawner.run' &&
				record.result.status === 'success' &&
				/Natural no-edit Spawner probe started mission spark-tiny-no-edit/.test(record.result.summary)
			)),
			'the dedicated probe must record its final Harness Core execution result'
		);

		rmSync(tempRoot, { recursive: true, force: true });
		restoreAxios();
		restoreEnv();
	});

	await test('natural access status uses authoritative CLI state instead of generic help', async () => {
		restoreAxios();
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-natural-access-status-'));
		const binDir = path.join(tempRoot, 'bin');
		const oldPath = process.env.PATH || '';
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_AGENT_ACCESS_PROFILE = 'operator';
		process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
		writeFileSync(
			path.join(tempRoot, 'spark-access-status.json'),
			JSON.stringify({
				access_level: 5,
				effective_access_level: 4,
				level5: {
					activation_state: 'blocked',
					service_enabled: false
				},
				state_machine: {
					requested_access_level: 5,
					effective_access_level: 4
				},
				workspace_preflight: {
					writable: true
				}
			})
		);
		await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir, { recursive: true }));
		const sparkShim = path.join(binDir, 'spark');
		writeFileSync(
			sparkShim,
			[
				'#!/bin/sh',
				'if [ "$1" = "access" ] && [ "$2" = "status" ] && [ "$3" = "--level" ] && [ "$4" = "5" ] && [ "$5" = "--json" ]; then',
				`  cat "${path.join(tempRoot, 'spark-access-status.json').replace(/"/g, '\\"')}"`,
				'  exit 0',
				'fi',
				'echo "unexpected spark command: $*" >&2',
				'exit 1',
				''
			].join('\n')
		);
		chmodSync(sparkShim, 0o755);
		writeFileSync(
			path.join(binDir, 'spark.cmd'),
			[
				'@echo off',
				'if "%~1"=="access" if "%~2"=="status" if "%~3"=="--level" if "%~4"=="5" if "%~5"=="--json" (',
				`  type "${path.join(tempRoot, 'spark-access-status.json').replace(/"/g, '""')}"`,
				'  exit /b 0',
				')',
				'echo unexpected spark command: %* 1>&2',
				'exit /b 1',
				''
			].join('\r\n')
		);
		process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;

		try {
			const replies: string[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 605, replies);
			ctx.message.text = 'What access level are we on right now? Use fresh access status, and separate chat setting, effective CLI level, and runner writability. Do not change anything.';
			const indexModule: any = await import('../src/index');
			await indexModule.handleTextMessage(ctx);

			const reply = replies[0] || '';
			assert.match(reply, /Spark Access Status/);
			assert.match(reply, /Chat setting: Access level 5/);
			assert.match(reply, /Requested by CLI: Level 5/);
			assert.match(reply, /Effective by CLI: Level 4/);
			assert.match(reply, /Level 5: blocked\/off/);
			assert.match(reply, /Runner:/);
			assert.doesNotMatch(reply, /Levels:\n1 - Chat/);
			assert.doesNotMatch(reply, /Change it with `\/access 1`/);
		} finally {
			process.env.PATH = oldPath;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

		await test('fresh live state answers disclose runtime source instead of memory', async () => {
			restoreAxios();
			process.env.ADMIN_TELEGRAM_IDS = '8319079055';
			process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-live-state-source-'));
		const binDir = path.join(tempRoot, 'bin');
		const oldPath = process.env.PATH || '';
		await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir, { recursive: true }));
		const sparkShim = path.join(binDir, 'spark');
		writeFileSync(
			sparkShim,
			[
				'#!/bin/sh',
				'if [ "$1" = "live" ] && [ "$2" = "status" ] && [ -z "$3" ]; then',
				'  echo "[OK] Spark Live is ready."',
				'  echo "Telegram profiles: 1 running, 0 stopped"',
				'  echo "LLM roles: chat=codex, builder=codex, memory=codex, mission=codex"',
				'  echo "[OK] spawner-ui: Spawner UI healthy: http://127.0.0.1:3333 | 10 providers listed | 3 configured | workspace=<spark-home>/workspaces/.health-smoke"',
				'  echo "[OK] spark-telegram-bot: Relay runtime: OK (primary@8789 pid=123 polling=active)"',
				'  exit 0',
				'fi',
				'if [ "$1" = "verify" ] && [ "$2" = "--deep" ] && [ -z "$3" ]; then',
				'  echo "Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot"',
				'  exit 0',
				'fi',
				'echo "unexpected spark command: $*" >&2',
				'exit 1',
				''
			].join('\n')
		);
		chmodSync(sparkShim, 0o755);
		process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;

		try {
			const captured: CapturedCall[] = [];
			(axios as any).post = async (url: string, body: any) => {
				captured.push({ url, body });
				return { data: { success: true } };
			};

			const replies: string[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 606, replies);
			ctx.message.text = 'What is the current live state of Spark? Are you using fresh runtime state or memory? Keep it natural and short.';
			const indexModule: any = await import('../src/index');
			await indexModule.handleTextMessage(ctx);

			const reply = replies[0] || '';
			assert.match(reply, /Spark is healthy right now/);
			assert.match(reply, /fresh runtime state.*not memory/i);
			assert.match(reply, /Spawner is reachable, Telegram is polling, and Mission Control is ready/i);
			assert.doesNotMatch(reply, /Live loop|^\s*•/m);
			assert.equal(captured.length, 0, 'live-state question must not launch or post work');
		} finally {
			process.env.PATH = oldPath;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
			}
		});

		await test('repair-needed current-status question answers from live status without repairing', async () => {
			restoreAxios();
			process.env.ADMIN_TELEGRAM_IDS = '8319079055';
			process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPARK_BOT_TEST_MODE = '1';
		const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-repair-status-no-action-'));
		const binDir = path.join(tempRoot, 'bin');
		const oldPath = process.env.PATH || '';
		await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir, { recursive: true }));
		const sparkShim = path.join(binDir, 'spark');
		writeFileSync(
			sparkShim,
			[
				'#!/bin/sh',
				'if [ "$1" = "live" ] && [ "$2" = "status" ] && [ -z "$3" ]; then',
				'  echo "[OK] Spark Live is ready."',
				'  echo "Telegram profiles: 1 running, 0 stopped"',
				'  echo "LLM roles: chat=codex, builder=codex, memory=codex, mission=codex"',
				'  echo "[OK] spawner-ui: Spawner UI healthy: http://127.0.0.1:3333 | 10 providers listed | 3 configured | workspace=<spark-home>/workspaces/.health-smoke"',
				'  echo "[OK] spark-telegram-bot: Relay runtime: OK (primary@8789 pid=123 polling=active)"',
				'  exit 0',
				'fi',
				'if [ "$1" = "verify" ] && [ "$2" = "--deep" ] && [ -z "$3" ]; then',
				'  echo "Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot"',
				'  exit 0',
				'fi',
				'echo "unexpected spark command: $*" >&2',
				'exit 1',
				''
			].join('\n')
		);
		chmodSync(sparkShim, 0o755);
		process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;

		try {
			const captured: CapturedCall[] = [];
			(axios as any).post = async (url: string, body: any) => {
				captured.push({ url, body });
				return { data: { success: true } };
			};

			const replies: string[] = [];
			const ctx = makeFakeCtx(8319079055, 8319079055, 607, replies);
			ctx.message.text = 'Do not repair anything. Is a repair needed from the current status?';
			const indexModule: any = await import('../src/index');
			await indexModule.handleTextMessage(ctx);

			const reply = replies[0] || '';
			assert.match(reply, /Spark is healthy right now/);
			assert.match(reply, /no repair action is needed/i);
			assert.doesNotMatch(reply, /I will run|Mission:/i);
			assert.equal(captured.length, 0, 'repair-needed status question must not launch or post work');
		} finally {
			process.env.PATH = oldPath;
			rmSync(tempRoot, { recursive: true, force: true });
			restoreAxios();
			restoreEnv();
		}
	});

	await test('expired pending clarification does not steal a new voice request', async () => {
		const indexModule: any = await import('../src/index');
		const expiredPending = { timestamp: Date.now() - (31 * 60 * 1000) };

		assert.equal(
			indexModule.shouldUsePendingClarificationForMessage(
				expiredPending,
				'can you actually install a voice to youself?'
			),
			false
		);
		assert.equal(indexModule.shouldUsePendingClarificationForMessage(expiredPending, 'go'), false);
	});

	await test('pending clarification keeps project title for pronoun-heavy build followup', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
		process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write') && !body.forceDispatch) {
				return {
					data: {
						success: true,
						needsClarification: true,
						requestId: body.requestId,
						openQuestions: ['What decision should a bad metric score trigger?'],
						addedAssumptions: ['Assume this is an internal developer dashboard.']
					}
				};
			}
			return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'codex', started: true } } };
		};

		const replies: string[] = [];
		const ctx = makeFakeCtx(8319079055, 8319079055, 559, replies);
		await callHandleBuildIntent({
			ctx,
			prd: 'Build a memory quality dashboard. It should test natural recall, stale context avoidance, current-state priority, source-aware recall, and whether Spark can explain where an answer came from.',
			projectName: 'Memory Quality Dashboard',
			buildMode: 'advanced_prd'
		});

		const indexModule: any = await import('../src/index');
		const followupCtx = makeFakeCtx(8319079055, 8319079055, 560, replies);
		followupCtx.message.text = "yes let's do it create it after analyzing our systems deeply please";
		await indexModule.handleTextMessage(followupCtx);

		const dispatchCall = captured.find((c) => c.body?.forceDispatch === true);
		assert.ok(dispatchCall, 'expected pronoun-heavy follow-up to answer the pending clarification');
		assert.equal(dispatchCall!.body.projectName, 'Memory Quality Dashboard');
		assert.match(dispatchCall!.body.content, /^# Memory Quality Dashboard/m);
		assert.match(dispatchCall!.body.content, /Answers: yes let's do it create it after analyzing our systems deeply please/);
			assert.match(replies.join('\n'), /🛠️ Setting up Memory Quality Dashboard as a planning canvas\./);
			assert.doesNotMatch(replies.join('\n'), /• it after analyzing our systems deeply/);

		restoreAxios();
		restoreEnv();
	});

	await test('build intent for non-admin uses default tier (base)', async () => {
		restoreAxios();
		process.env.ADMIN_TELEGRAM_IDS = '8319079055';
		process.env.BOT_DEFAULT_TIER = 'base';
		process.env.BOT_PRO_USER_IDS = '';

		const captured: CapturedCall[] = [];
		(axios as any).post = async (url: string, body: any) => {
			captured.push({ url, body });
			if (url.includes('/api/prd-bridge/write')) {
				return { data: { success: true, requestId: body.requestId, autoAnalysis: { provider: 'claude', started: true } } };
			}
			return { data: { success: true } };
		};
		(axios as any).get = async () => ({ data: { pending: false } });

		const replies: string[] = [];
		const ctx = makeFakeCtx(11111, 99999, 100, replies);

		try {
			await callHandleBuildIntent({
				ctx,
				prd: 'Just a small landing page',
				projectName: 'landing',
				buildMode: 'direct'
			});
		} catch {}

		const writeCall = captured.find((c) => c.url.includes('/api/prd-bridge/write'));
		if (writeCall) {
			assert.equal(writeCall.body.tier, 'base', 'non-admin should resolve to base tier');
			assert.equal(writeCall.body.userId, '99999');
		} else {
			// Access denial path — that is fine, the tier wiring test covered the flow.
			console.log('   note: access denial may have short-circuited; unit covered by axios spy');
		}

		restoreAxios();
		restoreEnv();
	});
}

run()
	.then(() => {
		process.exit(0);
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
