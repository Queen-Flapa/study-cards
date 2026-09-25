// Settings: your Anthropic API key, which AI model to use, spending limits, and usage history.
import { api } from '../api.js';
import { h, mount, navigate, pageHeader, toast, usd } from '../ui.js';
import { backupSection } from './backup.js';

/** The "paste your API key" form. Also shown on the notes page the first time. */
export function apiKeyForm(onSaved) {
  const input = h('input', {
    class: 'input mono', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: false,
    'aria-label': 'Anthropic API key',
  });
  async function save(e) {
    e.preventDefault();
    if (!input.value.trim()) return toast('Paste your API key first', 'error');
    try {
      await api.aiSaveSettings({ apiKey: input.value });
      toast('API key saved', 'success');
      onSaved?.();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return h('form', { class: 'stack', onSubmit: save },
    h('ol', { class: 'steps' },
      h('li', {}, 'Go to ', h('a', { href: 'https://platform.claude.com/settings/keys', target: '_blank', rel: 'noopener' }, 'platform.claude.com'),
        ' and sign in (or create an account).'),
      h('li', {}, 'Under ', h('strong', {}, 'Billing'), ', buy a small amount of credits (e.g. $5). ',
        h('strong', {}, 'Leave auto-reload off'), ' — then you can never be charged more than you put in.'),
      h('li', {}, 'Under ', h('strong', {}, 'API keys'), ', create a key and copy it.'),
      h('li', {}, 'Paste it below. It is stored only on this phone, and only ever sent to Anthropic.')),
    h('div', { class: 'inline-form' }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Save key')));
}

export async function settingsPage(root) {
  const s = await api.aiStatus();
  const reload = () => settingsPage(root);

  async function update(changes, message = 'Saved') {
    try {
      await api.aiSaveSettings(changes);
      toast(message, 'success');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const keySection = s.configured
    ? h('div', { class: 'stack' },
        h('p', {}, 'API key: ', h('code', {}, s.keyHint), ' ✓'),
        s.keyFromEnv
          ? h('p', { class: 'muted small' }, 'This key comes from the ANTHROPIC_API_KEY environment variable.')
          : h('div', { class: 'actions' },
              h('button', { class: 'btn small', onClick: () => mount(keyBox, apiKeyForm(reload)) }, 'Replace key'),
              h('button', { class: 'btn small danger-ghost', onClick: () => {
                if (confirm('Remove your API key from this phone?')) update({ apiKey: '' }, 'Key removed');
              } }, 'Remove key')))
    : apiKeyForm(reload);
  const keyBox = h('div', {}, keySection);

  const modelSelect = h('select', { class: 'input', onChange: (e) => update({ model: e.target.value }, 'Model changed') },
    s.models.map((m) => h('option', { value: m.id, selected: m.id === s.model },
      `${m.name}  ($${m.inputPerMTok} in / $${m.outputPerMTok} out per million tokens)`)));

  const budget = h('input', { class: 'input inline', type: 'number', min: 0, step: 0.5, value: s.monthlyBudgetUsd, style: { width: '110px' } });
  const maxChars = h('input', { class: 'input inline', type: 'number', min: 1000, step: 1000, value: s.maxNoteChars, style: { width: '130px' } });

  const used = s.monthlyBudgetUsd > 0 ? Math.min(1, s.spentThisMonthUsd / s.monthlyBudgetUsd) : 1;

  mount(root,
    pageHeader('Settings', 'AI features use your own Anthropic account.'),

    backupSection({ source: 'android', onImported: () => navigate('/') }),

    h('section', { class: 'panel' },
      h('h2', {}, 'Anthropic API key'),
      keyBox),

    h('section', { class: 'panel stack' },
      h('h2', {}, 'AI model'),
      modelSelect,
      h('p', { class: 'muted small' }, 'Haiku is plenty for turning notes into flashcards.')),

    h('section', { class: 'panel stack' },
      h('h2', {}, 'Spending limits'),
      h('div', { class: 'meter' }, h('div', { class: `meter-fill${used >= 1 ? ' full' : ''}`, style: { width: `${used * 100}%` } })),
      h('p', {}, `This month: ${usd(s.spentThisMonthUsd)} of ${usd(s.monthlyBudgetUsd)} budget · all time: ${usd(s.spentTotalUsd)} (${s.requestsTotal} requests)`),
      h('form', { class: 'limits', onSubmit: (e) => {
        e.preventDefault();
        update({ monthlyBudgetUsd: budget.value, maxNoteChars: maxChars.value });
      } },
        h('label', {}, 'Monthly budget ($) ', budget),
        h('label', {}, 'Max characters per conversion ', maxChars),
        h('button', { class: 'btn', type: 'submit' }, 'Save limits')),
      h('p', { class: 'muted small' },
        'The app refuses any AI request that could take you over your monthly budget. Set it to 0 to switch AI off. ',
        'Your real safety net is on Anthropic’s side: with prepaid credits and auto-reload off, you can never spend more than you’ve loaded.')),

    s.recent.length ? h('section', { class: 'panel' },
      h('h2', {}, 'Recent AI requests'),
      h('table', { class: 'usage' },
        h('thead', {}, h('tr', {}, ['When', 'Model', 'Tokens in / out', 'Cost'].map((t) => h('th', {}, t)))),
        h('tbody', {}, s.recent.map((r) => h('tr', {},
          h('td', {}, new Date(r.created_at).toLocaleString()),
          h('td', {}, r.model),
          h('td', {}, `${r.input_tokens.toLocaleString()} / ${r.output_tokens.toLocaleString()}`),
          h('td', {}, usd(r.cost_usd))))))) : null);
}
