export type ProviderRole = {
  role: string;
  provider: string;
  model: string;
  reasoning?: string;
  serviceTier?: string;
};

function configuredModelPhrase(role: ProviderRole): string {
  const model = /^grok-/i.test(role.model)
    ? `Grok ${role.model.replace(/^grok-/i, '')}`
    : (/^gpt-/i.test(role.model)
        ? `GPT-${role.model.replace(/^gpt-/i, '')}`
        : role.model);
  const provider = role.provider.toLowerCase();
  if (provider === 'openai' && /^grok-/i.test(role.model)) {
    return `${model} through the configured OpenAI-compatible provider`;
  }
  if (provider === 'codex') return `${model} through Codex`;
  if (provider === 'openai') return `${model} through OpenAI`;
  return `${model} through ${role.provider}`;
}

export function renderReleaseDecisionModelAnswer(
  roles: ProviderRole[],
  questionText: string
): string | null {
  if (!/\brelease decision(?:s)?\b/i.test(questionText) || !/\bmodel\b/i.test(questionText)) {
    return null;
  }
  const chatRole = roles.find((role) => role.role === 'chat');
  const missionRole = roles.find((role) => role.role === 'mission');
  if (!chatRole || !missionRole) return null;
  return `Chat is using ${configuredModelPhrase(chatRole)}. Spark's mission role—the model lane for release decisions—is using ${configuredModelPhrase(missionRole)}; provider settings were not changed, and human approval still owns the release.`;
}
