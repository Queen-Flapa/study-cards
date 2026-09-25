// Create or edit a set: title, description, and the list of cards.
import { api } from '../api.js';
import { CARD_SEPARATORS, TERM_SEPARATORS, guessTermSeparator, parseImport } from '../lib/importer.js';
import { fileDropZone, readTextFile } from '../lib/files.js';
import { h, mount, navigate, plural, toast } from '../ui.js';

export async function editorPage(root, id) {
  const isNew = !id;
  const set = isNew
    ? { title: '', description: '', cards: [] }
    : await api.getSet(id);

  // The cards being edited. Each keeps its database id (if any) so study progress is kept.
  let rows = set.cards.map((c) => ({ id: c.id, term: c.term, definition: c.definition }));
  while (rows.length < 3) rows.push({ id: null, term: '', definition: '' });
  let dirty = false;
  let saving = false;

  const title = h('input', {
    class: 'input big', placeholder: 'Enter a title, like “Biology – Chapter 22”',
    value: set.title, onInput: () => (dirty = true), 'aria-label': 'Title',
  });
  const description = h('textarea', {
    class: 'input', rows: 2, placeholder: 'Add a description (optional)',
    value: set.description, onInput: () => (dirty = true), 'aria-label': 'Description',
  });
  const list = h('div', { class: 'card-rows' });
  const importPanel = buildImportPanel();

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function field(row, key, label, onKeyDown) {
    const el = h('textarea', {
      class: 'input', rows: 1, value: row[key], placeholder: label, 'aria-label': label,
      onInput: (e) => { row[key] = e.target.value; dirty = true; autoGrow(e.target); },
      onKeyDown,
    });
    requestAnimationFrame(() => autoGrow(el));
    return el;
  }

  function renderRows(focusIndex) {
    mount(list, rows.map((row, i) => {
      const isLast = i === rows.length - 1;
      // Pressing Tab in the very last box adds a new card, like Quizlet.
      const onLastKey = (e) => {
        if (e.key === 'Tab' && !e.shiftKey && isLast) {
          e.preventDefault();
          addRow();
        }
      };
      return h('div', { class: 'card-row' },
        h('div', { class: 'row-head' },
          h('span', { class: 'muted small' }, i + 1),
          h('button', {
            class: 'icon-btn', title: 'Delete card', 'aria-label': `Delete card ${i + 1}`,
            onClick: () => { rows.splice(i, 1); dirty = true; renderRows(); },
          }, '🗑')),
        h('div', { class: 'row-fields' },
          h('label', {}, field(row, 'term', 'Term'), h('span', { class: 'field-label' }, 'TERM')),
          h('label', {}, field(row, 'definition', 'Definition', onLastKey),
            h('span', { class: 'field-label' }, 'DEFINITION'))));
    }));
    if (focusIndex != null) list.children[focusIndex]?.querySelector('textarea')?.focus();
  }

  function addRow() {
    rows.push({ id: null, term: '', definition: '' });
    dirty = true;
    renderRows(rows.length - 1);
  }

  function buildImportPanel() {
    const textarea = h('textarea', {
      class: 'input mono', rows: 6,
      placeholder: 'Paste your data here, one card per line:\nhola\thello\nadiós\tgoodbye',
      onInput: () => {
        termSep.value = guessTermSeparator(textarea.value);
        updatePreview();
      },
    });
    const termSep = h('select', { class: 'input', onChange: () => updatePreview() },
      TERM_SEPARATORS.map((s) => h('option', { value: s.id }, s.label)));
    const cardSep = h('select', { class: 'input', onChange: () => updatePreview() },
      CARD_SEPARATORS.map((s) => h('option', { value: s.id }, s.label)));
    const preview = h('p', { class: 'muted small' });
    const importBtn = h('button', { class: 'btn primary', disabled: true, onClick: doImport }, 'Import');

    function parse() {
      const t = TERM_SEPARATORS.find((s) => s.id === termSep.value).value;
      const c = CARD_SEPARATORS.find((s) => s.id === cardSep.value).value;
      return parseImport(textarea.value, t, c);
    }
    function updatePreview() {
      const { cards, skipped } = parse();
      preview.textContent = textarea.value.trim()
        ? `${plural(cards.length, 'card')} found` + (skipped.length ? ` · ${skipped.length} line(s) skipped (no separator)` : '')
        : '';
      importBtn.disabled = cards.length === 0;
    }
    function doImport() {
      const { cards } = parse();
      rows = rows.filter((r) => r.term.trim() || r.definition.trim());
      rows.push(...cards.map((c) => ({ id: null, ...c })));
      dirty = true;
      renderRows();
      textarea.value = '';
      updatePreview();
      panel.open = false;
      toast(`Imported ${plural(cards.length, 'card')}`, 'success');
    }

    const panel = h('details', { class: 'panel import' },
      h('summary', {}, 'Import from Quizlet, Word, Excel, Google Docs, or a .txt file…'),
      fileDropZone({
        label: 'Drop a .txt file with one card per line, or',
        onFiles: async ([{ file }]) => {
          try {
            textarea.value = await readTextFile(file);
            termSep.value = guessTermSeparator(textarea.value);
            updatePreview();
          } catch (err) {
            toast(err.message, 'error');
          }
        },
      }),
      textarea,
      h('p', { class: 'muted small' }, 'Messy notes rather than a list? Use ',
        h('a', { href: id ? `#/sets/${id}/notes` : '#/notes' }, '✨ Create from notes'), ' to let AI make the cards.'),
      h('div', { class: 'import-options' },
        h('label', {}, 'Between term and definition ', termSep),
        h('label', {}, 'Between cards ', cardSep),
        preview,
        importBtn));
    return panel;
  }

  async function save() {
    if (saving) return;
    const cards = rows.filter((r) => r.term.trim() || r.definition.trim());
    const incomplete = cards.findIndex((r) => !r.term.trim() || !r.definition.trim());
    if (!title.value.trim()) {
      toast('Please add a title', 'error');
      title.focus();
      return;
    }
    if (incomplete !== -1) {
      toast('Every card needs both a term and a definition', 'error');
      renderRows(rows.indexOf(cards[incomplete]));
      return;
    }
    saving = true;
    try {
      const body = { title: title.value, description: description.value, cards };
      const saved = isNew ? await api.createSet(body) : await api.updateSet(set.id, body);
      dirty = false;
      toast('Saved', 'success');
      navigate(`/sets/${saved.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      saving = false;
    }
  }

  renderRows();
  mount(root,
    h('a', { class: 'back', href: isNew ? '#/' : `#/sets/${set.id}` }, '← Cancel'),
    h('div', { class: 'page-header sticky' },
      h('h1', {}, isNew ? 'Create a new study set' : 'Edit set'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onClick: save }, isNew ? 'Create' : 'Save'))),
    h('div', { class: 'stack' }, title, description),
    importPanel,
    list,
    h('button', { class: 'btn add-card', onClick: addRow }, '+ Add card'),
    h('div', { class: 'footer-actions' },
      h('button', { class: 'btn primary big', onClick: save }, isNew ? 'Create' : 'Save')));
  if (isNew) title.focus();

  // Ctrl+S / Cmd+S saves; warn before closing the tab with unsaved changes.
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };
  const onUnload = (e) => { if (dirty) e.preventDefault(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onUnload);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onUnload);
  };
}
