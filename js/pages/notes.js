// "Create from notes": load notes (one file, several files, or a whole folder),
// let AI draft flashcards, review them, save.
//   #/notes          → makes new set(s)
//   #/sets/3/notes   → adds cards to set 3
//
// The flow has three screens:
//   1. Input    — load/paste notes. A folder is organized into chapters automatically.
//   2. Progress — the notes are sent in small batches, one AI request at a time.
//   3. Review   — check, edit and untick cards, then save (one set per chapter, or one set).
import { api } from '../api.js';
import { describeChapter, makeBatches, organizeNotes } from '../lib/chapters.js';
import { fileDropZone, readNotesFiles, titleFromFilename } from '../lib/files.js';
import { h, isTouch, mount, navigate, pageHeader, plural, progressBar, toast, usd } from '../ui.js';
import { apiKeyForm } from './settings.js';

const MAX_BATCH_CHARS = 8000;   // notes per AI request — small batches give more thorough cards
const RETRY_DELAY_MS = 5000;
const RETRYABLE = [409, 429, 502, 503, 504]; // busy / rate limited / network: wait and try again once
const FATAL = [400, 401, 402, 403];          // bad key, no credits, over budget: stop everything

export async function notesPage(root, setId) {
  const [status, target] = await Promise.all([api.aiStatus(), setId ? api.getSet(setId) : null]);
  const backHref = target ? `#/sets/${target.id}` : '#/';
  const BATCH_CHARS = Math.min(MAX_BATCH_CHARS, status.maxNoteChars);
  const heading = target ? `Add cards to “${target.title}” from notes` : 'Create flashcards from notes';

  if (!status.configured) {
    mount(root,
      h('a', { class: 'back', href: backHref }, '← Back'),
      pageHeader(heading, 'First, connect your Anthropic account (one-time setup).'),
      h('section', { class: 'panel' }, apiKeyForm(() => notesPage(root, setId))));
    return;
  }

  // ── State ────────────────────────────────────────────────────────
  let source = { kind: 'text', fileTitle: '' }; // or { kind: 'folder', org }
  let layout = 'chapters';  // folder only: 'chapters' (one set each) or 'combined' (one set)
  let groups = [];          // what we're making: one group = one future set
  let running = false;
  let stopRequested = false;
  let left = false;         // you navigated away — stop sending requests
  let fatalError = null;
  let totalCost = 0;

  // ── Screen 1: input ──────────────────────────────────────────────
  const notes = h('textarea', {
    class: 'input notes-input', rows: 12,
    placeholder: 'Your notes appear here. You can also paste or type them directly.',
    onInput: () => updateCount(),
  });
  const count = h('span', { class: 'muted small' });
  const focus = h('input', { class: 'input', placeholder: 'Optional: what to focus on, e.g. “exam objectives and port numbers”' });
  const maxCards = h('select', { class: 'input' },
    [['0', 'As many as needed'], ['10', 'Up to 10'], ['20', 'Up to 20'], ['30', 'Up to 30'], ['50', 'Up to 50']]
      .map(([v, label]) => h('option', { value: v }, label)));
  const detail = h('select', { class: 'input' },
    h('option', { value: 'thorough' }, 'Thorough — a card for every fact'),
    h('option', { value: 'key' }, 'Key facts only — fewer cards'));
  const confirmBox = h('div', { class: 'confirm-box', hidden: true });
  const goBtn = h('button', { class: 'btn primary big', onClick: estimate }, '✨ Make flashcards');

  function updateCount() {
    const n = notes.value.length;
    const parts = n > status.maxNoteChars ? ` · will be sent in ${Math.ceil(n / BATCH_CHARS)}+ parts` : '';
    count.textContent = `${n.toLocaleString()} characters${parts}`;
    confirmBox.hidden = true;
  }

  async function loadFiles(entries) {
    const { files, skipped } = await readNotesFiles(entries);
    if (files.length === 0) {
      toast(skipped.length ? 'No readable .txt files found there' : 'Nothing to load', 'error');
      return;
    }
    const isFolder = entries.some((e) => e.path.includes('/'));
    if (files.length === 1 && !isFolder) {
      // A single file: same as pasting it in.
      source = { kind: 'text', fileTitle: titleFromFilename(files[0].path.split('/').pop()) };
      notes.value = files[0].text;
      toast(`Loaded ${files[0].path}`, 'success');
    } else {
      const org = organizeNotes(files);
      org.skipped.push(...skipped);
      org.chapters.forEach((c) => (c.include = true));
      source = { kind: 'folder', org };
      layout = !target && org.chapters.length > 1 ? 'chapters' : 'combined';
      const used = org.chapters.reduce((n, c) => n + c.files.length, 0);
      toast(`Loaded ${plural(used, 'file')}${org.skipped.length ? ` (${org.skipped.length} skipped)` : ''}`, 'success');
    }
    showInput();
  }

  function clearFolder() {
    source = { kind: 'text', fileTitle: '' };
    showInput();
  }

  const STRATEGY_TEXT = {
    subfolders: 'one per subfolder',
    numbers: 'from the numbers at the start of the file names',
    single: 'no chapters found, so everything is together',
  };

  function folderOverview() {
    const { org } = source;
    const fileCount = org.chapters.reduce((n, c) => n + c.files.length, 0);
    const multi = org.chapters.length > 1;

    const layoutChoice = multi && !target
      ? h('div', { class: 'layout-choice' },
          [['chapters', `One set per chapter (${org.chapters.filter((c) => c.include).length} sets)`],
           ['combined', 'One set with everything']].map(([value, label]) =>
            h('label', { class: `choice${layout === value ? ' on' : ''}` },
              h('input', { type: 'radio', name: 'layout', value, checked: layout === value,
                onChange: () => { layout = value; showInput(); } }),
              ` ${label}`)))
      : null;

    return h('div', { class: 'folder-overview stack' },
      h('div', { class: 'panel-head' },
        h('p', {}, h('strong', {}, `📁 ${org.title || 'Your files'}`),
          ` — ${plural(fileCount, 'file')}, ${plural(org.chapters.length, 'chapter')} `,
          h('span', { class: 'muted small' }, `(${STRATEGY_TEXT[org.strategy]})`)),
        h('button', { class: 'link small', onClick: clearFolder }, 'Clear')),
      h('label', { class: 'stack' },
        h('span', { class: 'field-label' }, 'COURSE OR SUBJECT NAME'),
        h('input', { class: 'input', value: org.title, placeholder: 'e.g. CompTIA A+ (used to name the new sets)',
          onInput: (e) => (org.title = e.target.value.trim()) })),
      layoutChoice,
      h('div', { class: 'chapter-list' },
        org.chapters.map((c) => {
          const chars = c.files.reduce((n, f) => n + f.text.length, 0);
          return h('div', { class: `chapter-row${c.include ? '' : ' skipped'}` },
            multi ? h('input', { type: 'checkbox', checked: c.include, 'aria-label': `Include ${c.name}`,
              onChange: (e) => { c.include = e.target.checked; showInput(); } }) : null,
            h('input', { class: 'input chapter-name', value: c.name, 'aria-label': 'Chapter name',
              onInput: (e) => (c.name = e.target.value) }),
            h('details', { class: 'chapter-files' },
              h('summary', { class: 'muted small' }, `${plural(c.files.length, 'file')} · ${chars.toLocaleString()} characters`),
              h('ul', { class: 'small' }, c.files.map((f) => h('li', {}, f.name)))));
        })),
      org.skipped.length
        ? h('details', { class: 'muted small' },
            h('summary', {}, `${plural(org.skipped.length, 'file')} skipped`),
            h('ul', {}, org.skipped.map((s) => h('li', {}, `${s.path} — ${s.reason}`))))
        : null);
  }

  function showInput() {
    confirmBox.hidden = true;
    const folder = source.kind === 'folder';
    mount(root,
      h('a', { class: 'back', href: backHref }, '← Back'),
      pageHeader(heading, 'Load one or more .txt files of notes (select several at once for a whole course). AI drafts the cards, then you check them before anything is saved.',
        h('a', { class: 'btn small ghost', href: '#/settings' }, '⚙ AI settings')),
      h('section', { class: 'panel stack' },
        fileDropZone({
          // Android can pick many files at once, but not whole folders.
          onFiles: loadFiles, multiple: true, folders: !isTouch(),
          label: folder ? 'Load different notes:' : isTouch() ? 'Pick one or more .txt files:' : 'Drop .txt files or a folder here, or',
        }),
        folder ? folderOverview() : [notes, count],
        h('div', { class: 'two-col' },
          h('label', { class: 'stack' }, h('span', { class: 'field-label' }, 'FOCUS (OPTIONAL)'), focus),
          h('label', { class: 'stack' }, h('span', { class: 'field-label' }, folder ? 'DETAIL' : 'HOW MANY CARDS'),
            folder ? detail : maxCards)),
        h('div', { class: 'actions end' }, goBtn),
        confirmBox));
    if (!folder) updateCount();
  }

  // Turn the input into groups (future sets) of batches (AI requests).
  function buildGroups() {
    const batch = (b) => ({ ...b, status: 'pending', error: null, truncated: false });
    if (source.kind === 'text') {
      const text = notes.value.trim();
      const batches = text.length <= status.maxNoteChars
        ? [{ text, files: [] }]
        : makeBatches([{ name: 'notes', topic: source.fileTitle || 'Notes', text }], BATCH_CHARS);
      return [{ title: source.fileTitle, description: '', include: true, cards: [], batches: batches.map(batch) }];
    }
    const { org } = source;
    const chapters = org.chapters.filter((c) => c.include);
    const prefix = org.title && chapters.length > 1 ? `${org.title} – ` : '';
    if (layout === 'chapters') {
      return chapters.map((c) => ({
        title: org.strategy === 'single' ? (org.title || c.name) : `${prefix}${c.name}`,
        description: describeChapter(c.files),
        include: true, cards: [],
        batches: makeBatches(c.files, BATCH_CHARS).map(batch),
      }));
    }
    const all = chapters.flatMap((c) => c.files);
    return [{
      title: org.title || 'Notes', description: describeChapter(all), include: true, cards: [],
      batches: makeBatches(all, BATCH_CHARS).map(batch),
    }];
  }

  const allBatches = () => groups.flatMap((g) => g.batches);

  function requestOptions(batchCount) {
    const max = source.kind === 'text' ? Number(maxCards.value) : 0;
    return {
      focus: focus.value,
      detail: source.kind === 'folder' ? detail.value : 'thorough',
      maxCards: max ? Math.ceil(max / batchCount) : 0,
    };
  }

  // Before sending anything, show the most it could cost and ask to confirm.
  async function estimate() {
    if (source.kind === 'text' && !notes.value.trim()) return toast('Add some notes first', 'error');
    if (source.kind === 'folder' && !source.org.chapters.some((c) => c.include)) return toast('Tick at least one chapter', 'error');
    if (!navigator.onLine) return toast("You're offline. Connect to the internet to make flashcards with AI.", 'error');
    groups = buildGroups();
    const batches = allBatches();
    try {
      const est = await api.aiEstimate({ parts: batches.map((b) => b.text), ...requestOptions(batches.length) });
      const sets = groups.length;
      confirmBox.hidden = false;
      mount(confirmBox,
        h('p', {}, h('strong', {}, `This will cost at most ${usd(est.worstCaseUsd)}`),
          ` using ${est.model}. Usually it’s much less.`),
        h('p', { class: 'muted small' },
          `${plural(est.requests, 'AI request')} (${est.chars.toLocaleString()} characters)` +
          (target ? '' : ` → ${plural(sets, 'new set')}`) +
          ` · used this month: ${usd(est.spentThisMonthUsd)} of your ${usd(est.monthlyBudgetUsd)} budget.`),
        est.withinBudget
          ? h('div', { class: 'actions' },
              h('button', { class: 'btn ghost', onClick: () => (confirmBox.hidden = true) }, 'Cancel'),
              h('button', { class: 'btn primary', onClick: () => { totalCost = 0; runBatches(); } }, 'Convert'))
          : h('p', { class: 'bad' }, 'That would go over your monthly budget. ',
              h('a', { href: '#/settings' }, 'Change it in Settings'), ', or tick fewer chapters.'));
      confirmBox.querySelector('.btn.primary')?.focus();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ── Screen 2: progress ───────────────────────────────────────────
  const bar = progressBar();
  const progressText = h('p', { class: 'working' });
  const progressStats = h('p', { class: 'muted small' });
  const stopBtn = h('button', { class: 'btn', onClick: () => { stopRequested = true; stopBtn.disabled = true; stopBtn.textContent = 'Stopping after this request…'; } }, 'Stop');

  function updateProgress(current) {
    const batches = allBatches();
    const finished = batches.filter((b) => b.status !== 'pending' && b.status !== 'running').length;
    bar.update(finished / batches.length);
    if (current) {
      const { group, index } = current;
      const where = groups.length > 1 ? `${group.title} · ` : '';
      const files = group.batches[index].files.map((f) => f.replace(/\.[^.]+$/, ''));
      progressText.replaceChildren(h('span', { class: 'spinner' }),
        h('span', {}, `${where}part ${index + 1} of ${group.batches.length}`,
          files.length ? h('span', { class: 'muted small' }, ` — ${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}`) : null));
    }
    const cards = groups.reduce((n, g) => n + g.cards.length, 0);
    progressStats.textContent = `${finished} of ${plural(batches.length, 'request')} done · ${plural(cards, 'card')} so far · ${usd(totalCost)} spent`;
  }

  function showProgress() {
    stopBtn.disabled = false;
    stopBtn.textContent = 'Stop';
    mount(root,
      pageHeader('Making flashcards…', 'Keep the app open until it finishes — leaving this screen or locking the phone pauses it.'),
      h('section', { class: 'panel stack' }, bar, progressText, progressStats, h('div', { class: 'actions end' }, stopBtn)));
    updateProgress();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function callAi(b, options) {
    try {
      return await api.aiFlashcards({ notes: b.text, ...options });
    } catch (err) {
      if (!RETRYABLE.includes(err.status) || left) throw err;
      await sleep(RETRY_DELAY_MS);
      return api.aiFlashcards({ notes: b.text, ...options });
    }
  }

  async function runBatches() {
    running = true;
    stopRequested = false;
    fatalError = null;
    window.addEventListener('beforeunload', warnUnsaved);
    showProgress();
    const options = requestOptions(allBatches().length);

    outer: for (const group of groups) {
      for (const [index, b] of group.batches.entries()) {
        if (b.status === 'done' || b.status === 'empty') continue;
        if (stopRequested || left) break outer;
        b.status = 'running';
        updateProgress({ group, index });
        try {
          const r = await callAi(b, options);
          b.status = 'done';
          b.truncated = r.truncated;
          totalCost += r.costUsd;
          group.cards.push(...r.cards.map((c) => ({ ...c, keep: true })));
          if (!group.title && r.title) group.title = r.title;
        } catch (err) {
          if (err.status === 422) { b.status = 'empty'; b.error = err.message; continue; } // nothing to make cards from
          b.status = 'failed';
          b.error = err.message;
          if (FATAL.includes(err.status)) { fatalError = err.message; break outer; }
        }
      }
    }
    for (const b of allBatches()) if (b.status === 'running') b.status = 'failed';
    running = false;
    if (left) return;
    showReview();
  }

  // ── Screen 3: review ─────────────────────────────────────────────
  function showReview() {
    const batches = allBatches();
    const failed = batches.filter((b) => b.status === 'failed' || b.status === 'pending');
    const truncated = batches.some((b) => b.truncated);
    const withCards = groups.filter((g) => g.cards.length);
    const totalCards = withCards.reduce((n, g) => n + g.cards.length, 0);
    const saveBtn = h('button', { class: 'btn primary big', onClick: save });
    const single = groups.length === 1;

    function refreshSave() {
      const sets = withCards.filter((g) => g.include && g.cards.some((c) => c.keep));
      const n = sets.reduce((sum, g) => sum + g.cards.filter((c) => c.keep).length, 0);
      saveBtn.textContent = target
        ? `Add ${plural(n, 'card')} to set`
        : sets.length === 1 ? `Create set with ${plural(n, 'card')}` : `Create ${sets.length} sets with ${plural(n, 'card')}`;
      saveBtn.disabled = n === 0;
    }

    function groupSection(g, i) {
      const list = h('div', { class: 'card-rows' });
      const countEl = h('span', { class: 'muted small' });
      const renderRows = () => {
        mount(list, g.cards.map((row, j) => cardRow(row, j, renderRows)));
        countEl.textContent = `${g.cards.filter((c) => c.keep).length} of ${plural(g.cards.length, 'card')} selected`;
        refreshSave();
      };
      const setAll = (keep) => { g.cards.forEach((c) => (c.keep = keep)); renderRows(); };
      renderRows();

      const titleInput = target ? null : h('input', {
        class: 'input big', value: g.title || 'Notes', 'aria-label': 'Set title',
        onInput: (e) => (g.title = e.target.value),
      });
      const body = h('div', { class: 'stack' },
        titleInput,
        g.description ? h('p', { class: 'muted small' }, g.description) : null,
        h('div', { class: 'actions' },
          h('button', { class: 'btn small', onClick: () => setAll(true) }, 'Select all'),
          h('button', { class: 'btn small', onClick: () => setAll(false) }, 'Select none'),
          countEl),
        list);
      if (single) return body;

      // Several sets: each one is a collapsible section.
      const heading = h('span', { class: 'group-title' }, g.title);
      titleInput?.addEventListener('input', () => (heading.textContent = g.title));
      return h('details', { class: `panel group${g.include ? '' : ' skipped'}`, open: i === 0 },
        h('summary', {},
          target ? null : h('input', { type: 'checkbox', checked: g.include, 'aria-label': `Save ${g.title}`,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => { g.include = e.target.checked; e.target.closest('details').classList.toggle('skipped', !g.include); refreshSave(); } }),
          heading,
          h('span', { class: 'pill' }, plural(g.cards.length, 'card'))),
        body);
    }

    async function save() {
      const sets = withCards
        .filter((g) => g.include)
        .map((g) => ({ ...g, cards: g.cards.filter((c) => c.keep).map((c) => ({ term: c.term.trim(), definition: c.definition.trim() })) }))
        .filter((g) => g.cards.length);
      if (sets.some((g) => g.cards.some((c) => !c.term || !c.definition))) {
        return toast('Every kept card needs both a term and a definition', 'error');
      }
      if (!target && sets.some((g) => !String(g.title || '').trim())) return toast('Every set needs a title', 'error');
      saveBtn.disabled = true;
      try {
        let goTo;
        if (target) {
          const fresh = await api.getSet(target.id); // include any edits made since this page opened
          await api.updateSet(fresh.id, {
            title: fresh.title, description: fresh.description,
            cards: [...fresh.cards, ...sets.flatMap((g) => g.cards)],
          });
          goTo = `/sets/${fresh.id}`;
        } else {
          let lastId;
          for (const g of sets) {
            lastId = (await api.createSet({ title: g.title, description: g.description || 'Made from notes with AI', cards: g.cards })).id;
          }
          goTo = sets.length === 1 ? `/sets/${lastId}` : '/';
        }
        window.removeEventListener('beforeunload', warnUnsaved);
        const n = sets.reduce((sum, g) => sum + g.cards.length, 0);
        toast(sets.length > 1 && !target ? `Created ${sets.length} sets (${plural(n, 'card')})` : `Saved ${plural(n, 'card')}`, 'success');
        navigate(goTo);
      } catch (err) {
        toast(err.message, 'error');
        saveBtn.disabled = false;
      }
    }

    const failedNotice = failed.length
      ? h('div', { class: 'notice stack' },
          h('p', {}, fatalError
            ? `Stopped: ${fatalError}`
            : stopRequested
              ? `Stopped early — ${plural(failed.length, 'part')} not converted yet.`
              : `${plural(failed.length, 'part')} couldn’t be converted.`),
          !fatalError && failed.some((b) => b.error)
            ? h('ul', { class: 'small' }, failed.filter((b) => b.error).slice(0, 5).map((b) =>
                h('li', {}, `${b.files.join(', ') || 'Notes'}: ${b.error}`)))
            : null,
          h('div', { class: 'actions' },
            h('button', { class: 'btn small', onClick: runBatches }, `Try the remaining ${plural(failed.length, 'part')} again`)))
      : null;

    mount(root,
      h('button', { class: 'back link', onClick: showInput }, '← Back to notes'),
      pageHeader('Check your new flashcards',
        totalCards
          ? `AI made ${plural(totalCards, 'card')}${withCards.length > 1 ? ` in ${withCards.length} sets` : ''} for ${usd(totalCost)}. Fix anything that’s off and untick cards you don’t want.`
          : failed.length
            ? 'No cards were made yet.'
            : 'The AI couldn’t find anything to make flashcards from in these notes. Try different notes, or add a focus.'),
      failedNotice,
      truncated ? h('p', { class: 'notice' }, 'Some parts were long, so the AI may have stopped early on them. You can convert those notes again separately.') : null,
      withCards.map(groupSection),
      totalCards ? h('div', { class: 'footer-actions' }, saveBtn) : null);
    refreshSave();
  }

  function cardRow(row, i, rerender) {
    const field = (key, label) => {
      const el = h('textarea', {
        class: 'input', rows: 1, value: row[key], 'aria-label': label,
        onInput: (e) => { row[key] = e.target.value; e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; },
      });
      requestAnimationFrame(() => { el.style.height = `${el.scrollHeight}px`; });
      return h('label', {}, el, h('span', { class: 'field-label' }, label.toUpperCase()));
    };
    return h('div', { class: `card-row${row.keep ? '' : ' skipped'}` },
      h('div', { class: 'row-head' },
        h('label', { class: 'keep' },
          h('input', { type: 'checkbox', checked: row.keep, onChange: (e) => { row.keep = e.target.checked; rerender(); } }),
          ` Card ${i + 1}`)),
      h('div', { class: 'row-fields' }, field('term', 'Term'), field('definition', 'Definition')));
  }

  function warnUnsaved(e) { e.preventDefault(); }

  showInput();
  return () => {
    left = true; // stops the batch loop before its next request
    window.removeEventListener('beforeunload', warnUnsaved);
  };
}
