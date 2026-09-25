// "Backup & transfer" section of the Settings page: export all sets to a file,
// or import sets from a file (for example, one exported from the PC version).
// Only uses api.js, so this exact file works in both the PC and Android versions.
import { api } from '../api.js';
import { buildExport, exportFilename, parseExport, planImport } from '../lib/transfer.js';
import { h, mount, plural, toast } from '../ui.js';

export function backupSection({ source, onImported } = {}) {
  const status = h('div', { class: 'stack' });

  async function exportAll() {
    try {
      const list = await api.listSets();
      if (list.length === 0) return toast('There are no sets to export yet', 'error');
      const full = [];
      for (const s of list) full.push(await api.getSet(s.id));
      const data = buildExport(full, source);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: exportFilename() });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const cards = full.reduce((n, s) => n + s.cards.length, 0);
      toast(`Exported ${plural(full.length, 'set')} (${plural(cards, 'card')})`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const incoming = parseExport(await file.text());
      if (incoming.length === 0) return toast('That backup has no sets in it', 'error');
      const existing = [];
      for (const s of await api.listSets()) existing.push(await api.getSet(s.id));
      showPlan(planImport(incoming, existing), file.name);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  function showPlan(plan, fileName) {
    const toImport = plan.filter((p) => p.action !== 'skip');
    const skipped = plan.length - toImport.length;
    mount(status, h('div', { class: 'confirm-box' },
      h('p', {}, h('strong', {}, `${fileName}: ${plural(plan.length, 'set')}`)),
      h('ul', { class: 'small import-plan' }, plan.map((p) => h('li', {},
        `${p.title} — ${plural(p.set.cards.length, 'card')}`,
        p.action === 'skip' ? h('span', { class: 'muted' }, ' (already here, skipped)') : null,
        p.action === 'rename' ? h('span', { class: 'muted' }, ' (renamed: you already have a different set with that name)') : null))),
      toImport.length
        ? h('div', { class: 'actions' },
            h('button', { class: 'btn ghost', onClick: () => mount(status) }, 'Cancel'),
            h('button', { class: 'btn primary', onClick: () => runImport(toImport) },
              `Import ${plural(toImport.length, 'set')}`))
        : h('p', { class: 'muted' }, 'You already have everything in this backup.'),
      skipped && toImport.length ? h('p', { class: 'muted small' }, `${skipped} identical ${skipped === 1 ? 'set is' : 'sets are'} skipped.`) : null));
  }

  async function runImport(items) {
    mount(status, h('p', { class: 'working' }, h('span', { class: 'spinner' }), h('span', {}, 'Importing…')));
    let done = 0;
    try {
      for (const p of items) {
        await api.createSet({ title: p.title, description: p.set.description, cards: p.set.cards });
        done++;
      }
      mount(status);
      toast(`Imported ${plural(done, 'set')}`, 'success');
      onImported?.();
    } catch (err) {
      mount(status);
      toast(`Imported ${done} of ${items.length} sets, then: ${err.message}`, 'error');
    }
  }

  return h('section', { class: 'panel stack', id: 'backup' },
    h('h2', {}, 'Backup & transfer'),
    h('p', { class: 'muted small' },
      'Export saves all your sets to one file. Import it on your other device (PC ⇄ phone) or keep it as a backup. ',
      'Cards come across; study progress stays on each device.'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onClick: exportAll }, '⬇ Export all sets'),
      h('button', { class: 'btn', onClick: () => fileInput.click() }, '⬆ Import from file'),
      fileInput),
    status);
}
