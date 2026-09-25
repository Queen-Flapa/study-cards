// AI: settings, cost estimates, and turning notes into flashcards.
// Same rules and spending safeguards as the PC server's modules/ai.js:
//  1. Nothing runs unless you tap a button — no background or automatic calls.
//  2. Notes longer than `maxNoteChars` are refused.
//  3. Every request is capped at a maximum output size, so its worst-case cost is known up front.
//  4. A request is refused if its worst-case cost would take you over your monthly budget.
//  5. Only one AI request can run at a time.
//  6. Every request's real cost is logged and shown in Settings.
import { AppError, getSetting, nowIso, req, setSetting, tx } from './db.js';
import { MODELS, costUsd, estimateTokens, getModel } from './ai/models.js';
import { generateFlashcards, PROMPT_OVERHEAD_TOKENS } from './ai/claude.js';

const TOKENS_PER_CARD = 70;
const MIN_OUTPUT_TOKENS = 1500;
const MAX_OUTPUT_TOKENS = 8000;

const DEFAULTS = {
  anthropicApiKey: '',
  model: 'claude-haiku-4-5',
  monthlyBudgetUsd: 2,
  maxNoteChars: 40000,
};

let busy = false;

async function getConfig() {
  return { ...DEFAULTS, ...(await getSetting('ai', {})) };
}

function monthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function usage() {
  const rows = await tx('ai_usage', 'readonly', (s) => req(s.ai_usage.getAll()));
  const since = monthStart();
  return {
    spentThisMonthUsd: rows.filter((r) => r.created_at >= since).reduce((n, r) => n + r.cost_usd, 0),
    spentTotalUsd: rows.reduce((n, r) => n + r.cost_usd, 0),
    requestsTotal: rows.length,
    recent: rows.sort((a, b) => b.id - a.id).slice(0, 10),
  };
}

function maxOutputFor(inputTokens, maxCards, detail) {
  const ratio = detail === 'key' ? 0.6 : 1.2;
  const wanted = maxCards
    ? maxCards * TOKENS_PER_CARD + 300
    : Math.max(MIN_OUTPUT_TOKENS, Math.round(inputTokens * ratio));
  return Math.min(MAX_OUTPUT_TOKENS, wanted);
}

function plan(cfg, spent, body) {
  const notes = String(body?.notes ?? '').trim();
  const focus = String(body?.focus ?? '').trim().slice(0, 300);
  const maxCards = Math.max(0, Math.min(200, Number(body?.maxCards) || 0));
  const detail = body?.detail === 'key' ? 'key' : 'thorough';
  if (!notes) throw new AppError(400, 'There are no notes to convert.');
  if (notes.length > cfg.maxNoteChars) {
    throw new AppError(400,
      `These notes are ${notes.length.toLocaleString()} characters; the limit is ${cfg.maxNoteChars.toLocaleString()}. ` +
      'Split them into smaller parts, or raise the limit in Settings.');
  }
  const inputTokens = estimateTokens(notes + focus) + PROMPT_OVERHEAD_TOKENS;
  const maxOutputTokens = maxOutputFor(inputTokens, maxCards, detail);
  const worstCaseUsd = costUsd(cfg.model, inputTokens, maxOutputTokens);
  return {
    cfg, notes, focus, maxCards, detail, inputTokens, maxOutputTokens, worstCaseUsd,
    spentThisMonthUsd: spent,
    monthlyBudgetUsd: cfg.monthlyBudgetUsd,
    withinBudget: spent + worstCaseUsd <= cfg.monthlyBudgetUsd,
  };
}

export async function aiStatus() {
  const cfg = await getConfig();
  const key = cfg.anthropicApiKey;
  return {
    configured: Boolean(key),
    keyHint: key ? `…${key.slice(-4)}` : null,
    keyFromEnv: false,
    model: cfg.model,
    models: MODELS.map(({ id, name, inputPerMTok, outputPerMTok }) => ({ id, name, inputPerMTok, outputPerMTok })),
    monthlyBudgetUsd: cfg.monthlyBudgetUsd,
    maxNoteChars: cfg.maxNoteChars,
    ...(await usage()),
  };
}

export async function aiSaveSettings(b = {}) {
  const changes = {};
  if (b.apiKey !== undefined) {
    const key = String(b.apiKey).trim();
    if (/\s/.test(key)) throw new AppError(400, "That doesn't look like an API key (it contains spaces).");
    changes.anthropicApiKey = key;
  }
  if (b.model !== undefined) {
    if (!MODELS.some((m) => m.id === b.model)) throw new AppError(400, 'Unknown model');
    changes.model = b.model;
  }
  if (b.monthlyBudgetUsd !== undefined) {
    const n = Number(b.monthlyBudgetUsd);
    if (!(n >= 0 && n <= 1000)) throw new AppError(400, 'Monthly budget must be between $0 and $1000');
    changes.monthlyBudgetUsd = Math.round(n * 100) / 100;
  }
  if (b.maxNoteChars !== undefined) {
    const n = Math.round(Number(b.maxNoteChars));
    if (!(n >= 1000 && n <= 400000)) throw new AppError(400, 'Note size limit must be between 1,000 and 400,000 characters');
    changes.maxNoteChars = n;
  }
  await setSetting('ai', { ...(await getSetting('ai', {})), ...changes });
  return { ok: true };
}

// What a conversion would cost at most. { notes } for one request, { parts: [...] } for many.
export async function aiEstimate(body = {}) {
  const cfg = await getConfig();
  const { spentThisMonthUsd } = await usage();
  const parts = Array.isArray(body.parts) ? body.parts : [body.notes];
  if (parts.length === 0) throw new AppError(400, 'There are no notes to convert.');
  if (parts.length > 300) throw new AppError(400, 'Too many parts in one go. Try fewer files.');
  const plans = parts.map((notes) => plan(cfg, spentThisMonthUsd, { ...body, notes }));
  const worst = plans.reduce((n, p) => n + p.worstCaseUsd, 0);
  return {
    model: getModel(cfg.model).short,
    requests: plans.length,
    chars: plans.reduce((n, p) => n + p.notes.length, 0),
    estimatedInputTokens: plans.reduce((n, p) => n + p.inputTokens, 0),
    maxOutputTokens: plans.reduce((n, p) => n + p.maxOutputTokens, 0),
    worstCaseUsd: worst,
    spentThisMonthUsd,
    monthlyBudgetUsd: cfg.monthlyBudgetUsd,
    withinBudget: spentThisMonthUsd + worst <= cfg.monthlyBudgetUsd,
  };
}

export async function aiFlashcards(body) {
  const cfg = await getConfig();
  const p = plan(cfg, (await usage()).spentThisMonthUsd, body);
  if (!cfg.anthropicApiKey) throw new AppError(400, 'Add your Anthropic API key in Settings first.');
  if (!p.withinBudget) {
    throw new AppError(402,
      `This could cost up to $${p.worstCaseUsd.toFixed(3)}, which would take you over your monthly AI budget ` +
      `($${p.spentThisMonthUsd.toFixed(2)} of $${p.monthlyBudgetUsd.toFixed(2)} used). You can change the budget in Settings.`);
  }
  if (busy) throw new AppError(409, 'An AI request is already running. Please wait for it to finish.');
  if (!navigator.onLine) throw new AppError(403, "You're offline. Connect to the internet to use AI.");

  busy = true;
  try {
    const result = await generateFlashcards({
      apiKey: cfg.anthropicApiKey, model: cfg.model, notes: p.notes, focus: p.focus,
      maxCards: p.maxCards, detail: p.detail, maxOutputTokens: p.maxOutputTokens,
    });
    const cost = costUsd(cfg.model, result.usage.input_tokens, result.usage.output_tokens);
    await tx('ai_usage', 'readwrite', (s) => req(s.ai_usage.add({
      created_at: nowIso(), purpose: 'notes-to-flashcards', model: cfg.model,
      input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens, cost_usd: cost,
    })));
    if (result.cards.length === 0) {
      throw new AppError(422, result.truncated
        ? 'The notes were too long to finish in one go. Try splitting them, or set a maximum number of cards.'
        : "The AI couldn't find anything to make flashcards from in these notes.");
    }
    return {
      title: result.title,
      cards: result.cards.slice(0, p.maxCards || undefined),
      truncated: result.truncated,
      costUsd: cost,
      usage: result.usage,
    };
  } finally {
    busy = false;
  }
}
