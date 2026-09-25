// Models you can choose in Settings, with their prices in US dollars per
// million tokens (a token is roughly 3–4 characters of English text).
// Prices from https://platform.claude.com/docs/en/about-claude/pricing (Sept 2026).
// If Anthropic changes prices, update the numbers here.
export const MODELS = [
  {
    id: 'claude-haiku-4-5',
    short: 'Claude Haiku 4.5',
    name: 'Claude Haiku 4.5 — cheapest, recommended',
    inputPerMTok: 1,
    outputPerMTok: 5,
  },
  {
    id: 'claude-sonnet-5',
    short: 'Claude Sonnet 5',
    name: 'Claude Sonnet 5 — smarter, about 2× the price',
    inputPerMTok: 2,
    outputPerMTok: 10,
  },
];

export function getModel(id) {
  return MODELS.find((m) => m.id === id) || MODELS[0];
}

export function costUsd(model, inputTokens, outputTokens) {
  const m = getModel(model);
  return (inputTokens * m.inputPerMTok + outputTokens * m.outputPerMTok) / 1_000_000;
}

/** Rough token count before sending. Deliberately errs on the high side. */
export function estimateTokens(text) {
  return Math.ceil(String(text).length / 3);
}
