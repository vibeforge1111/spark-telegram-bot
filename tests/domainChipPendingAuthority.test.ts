import assert from 'node:assert/strict';
import axios from 'axios';
import { spawnerPrdWriteAuthorityFailureReason } from '../src/spawnerPrdWriteAuthority';

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

function assertSpawnerPrdWriteAuthority(authority: any, requestId: string): void {
	assert.equal(authority?.schema_version, 'governor-decision-v1');
	assert.equal(authority?.tool_ledgers?.[0]?.tool_name, 'spawner.prd.write');
	assert.equal(spawnerPrdWriteAuthorityFailureReason(authority), null);
	const pathOrUri = String(authority?.envelope?.proposed_actions?.[0]?.args_ref?.path_or_uri || '');
	assert.equal(decodeURIComponent(pathOrUri.split('/').pop() || ''), requestId);
}

async function run(): Promise<void> {
	const originalPost = axios.post;
	const originalGet = axios.get;
	const originalEnv = {
		ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
		BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
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
		delete process.env.SPARK_MODEL_ROUTER;

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

		assert.match(replies.join('\n'), /I can build this as domain-chip-payments-risk-domain-chip-for/);
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

		const pendingChipWrite = captured.find((call) => call.url.includes('/api/prd-bridge/write'));
		assert.ok(pendingChipWrite, 'go should dispatch the pending domain chip');
		assertSpawnerPrdWriteAuthority(pendingChipWrite!.body.executionAuthority, pendingChipWrite!.body.requestId);
		assert.match(replies.join('\n'), /Starting domain-chip-payments-risk-domain-chip-for with the recommended defaults/i);

		console.log('ok - domain chip pending go dispatches with Harness authority');
	} finally {
		(axios as any).post = originalPost;
		(axios as any).get = originalGet;
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) delete (process.env as any)[key];
			else (process.env as any)[key] = value;
		}
	}
}

run().catch((error) => {
	console.error('not ok - domain chip pending go dispatches with Harness authority');
	console.error(error);
	process.exit(1);
});
