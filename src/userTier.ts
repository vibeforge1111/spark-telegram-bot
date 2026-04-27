/**
 * userTier.ts — resolves a Telegram user ID to a Spark skill tier.
 *
 * Tier model (matches spawner-ui/src/lib/server/skill-tiers.ts):
 *   - base: ~41 skills, the union of all curated bundles in spark-skill-graphs.
 *   - pro:  ~615 skills, the full spark-skill-graphs catalog.
 *
 * Resolution order:
 *   1. If userId is in BOT_PRO_USER_IDS, tier = 'pro'.
 *   2. If userId is in ADMIN_TELEGRAM_IDS, tier = 'pro' (admins always pro).
 *   3. Otherwise tier = BOT_DEFAULT_TIER (default 'base').
 *
 * The resolved tier is sent to spawner-ui in the request body for both
 * /api/spark/run and /api/prd-bridge/write so the codex prompt embeds the
 * matching skill allowlist.
 */

export type SkillTier = 'base' | 'pro';

function parseIdList(value: string | undefined): Set<string> {
	if (!value) return new Set();
	return new Set(
		value
			.split(/[,\s]+/)
			.map((s) => s.trim())
			.filter(Boolean)
	);
}

function readDefaultTier(): SkillTier {
	const raw = process.env.BOT_DEFAULT_TIER?.trim().toLowerCase();
	return raw === 'pro' ? 'pro' : 'base';
}

export function getTierForUser(userId: number | string | undefined): SkillTier {
	if (userId == null) return readDefaultTier();
	const id = String(userId).trim();
	if (!id) return readDefaultTier();

	const proUsers = parseIdList(process.env.BOT_PRO_USER_IDS);
	if (proUsers.has(id)) return 'pro';

	const admins = parseIdList(process.env.ADMIN_TELEGRAM_IDS);
	if (admins.has(id)) return 'pro';

	return readDefaultTier();
}

export function describeTier(tier: SkillTier): string {
	return tier === 'pro'
		? 'pro tier (full spark-skill-graphs catalog)'
		: 'base tier (curated bundle loadout, ~41 skills)';
}
