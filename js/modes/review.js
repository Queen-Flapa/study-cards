// Spaced review: shows the cards that are due today. Rate how well you knew
// each one, and the app schedules when you'll see it next (like Anki).
import { h, isTouch, mount, plural, timeFromNow } from '../ui.js';

const GRADES = [
  { value: 0, label: 'Again', key: '1', class: 'again' },
  { value: 1, label: 'Hard', key: '2', class: 'hard' },
  { value: 2, label: 'Good', key: '3', class: 'good' },
  { value: 3, label: 'Easy', key: '4', class: 'easy' },
];

export const review = {
  id: 'review',
  name: 'Spaced review',
  description: 'Review what’s due today. Missed cards come back sooner.',
  icon: '🧠',
  minCards: 1,

  async start(container, set, ctx) {
    let queue = [];
    let reviewed = 0;
    let revealed = false;
    let busy = false;
    const tally = [0, 0, 0, 0];
    let current = null;

    async function load() {
      queue = await ctx.api.dueCards(set.id);
      reviewed = 0;
      tally.fill(0);
      if (queue.length === 0) return caughtUp();
      show();
    }

    function show() {
      current = queue[0];
      revealed = false;
      ctx.setProgress(reviewed / (reviewed + queue.length));
      ctx.setStatus(`${plural(queue.length, 'card')} left`);
      render();
    }

    function render() {
      const c = current;
      mount(container,
        h('div', { class: 'review-card' },
          c.is_new ? h('span', { class: 'pill new' }, 'New') : null,
          h('span', { class: 'face-label' }, 'term'),
          h('p', { class: 'prompt' }, c.term),
          revealed
            ? h('div', { class: 'answer' },
                h('span', { class: 'face-label' }, 'definition'),
                h('p', { class: 'prompt' }, c.definition))
            : null),
        revealed
          ? h('div', { class: 'grades' },
              GRADES.map((g) => h('button', { class: `grade ${g.class}`, onClick: () => grade(g.value) },
                h('strong', {}, g.label),
                h('span', { class: 'small' }, c.preview[g.value]),
                h('span', { class: 'key' }, g.key))))
          : h('div', { class: 'center' },
              h('button', { class: 'btn primary big', onClick: reveal }, 'Show answer')),
        h('p', { class: 'muted small center' },
          revealed ? `How well did you know it?${isTouch() ? '' : ' Keys 1–4'}` : `Try to recall the answer${isTouch() ? ', then tap Show answer' : ', then press Space'}`));
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      render();
    }

    async function grade(value) {
      if (!revealed || busy) return;
      busy = true;
      try {
        const result = await ctx.api.gradeCard(current.id, value);
        tally[value]++;
        queue.shift();
        if (value === 0) {
          // Forgotten: see it again at the end of this session.
          queue.push({ ...current, is_new: false, preview: result.preview });
        } else {
          reviewed++;
        }
        if (queue.length) show();
        else finish();
      } catch (err) {
        ctx.toast(err.message, 'error');
      } finally {
        busy = false;
      }
    }

    async function caughtUp() {
      current = null;
      const stats = await ctx.api.reviewStats(set.id);
      ctx.setProgress(1);
      ctx.setStatus('');
      mount(container, h('div', { class: 'summary' },
        h('h2', {}, '✅ All caught up!'),
        h('p', { class: 'muted' }, stats.next_due_at
          ? `Your next review is ${timeFromNow(stats.next_due_at)}.`
          : 'Nothing is due right now.'),
        h('div', { class: 'actions center' },
          h('a', { class: 'btn', href: `#/sets/${set.id}/study/flashcards` }, 'Practice with flashcards'),
          h('a', { class: 'btn', href: `#/sets/${set.id}` }, 'Back to set'))));
    }

    function finish() {
      current = null;
      ctx.setProgress(1);
      ctx.setStatus('Done');
      mount(container, h('div', { class: 'summary' },
        h('h2', {}, '🎉 Session complete'),
        h('p', { class: 'muted' }, `You reviewed ${plural(reviewed, 'card')}.`),
        h('div', { class: 'stats' }, GRADES.map((g) =>
          h('div', { class: `stat ${g.class}` }, h('strong', {}, tally[g.value]), h('span', { class: 'muted small' }, g.label)))),
        h('p', { class: 'muted small' }, 'Come back tomorrow — the app will have the right cards waiting.'),
        h('div', { class: 'actions center' },
          h('button', { class: 'btn', onClick: load }, 'Check for more'),
          h('a', { class: 'btn primary', href: `#/sets/${set.id}` }, 'Back to set'))));
    }

    function onKey(e) {
      if (e.target.matches('input, textarea, select') || !current) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!revealed) reveal();
        else grade(2); // Space/Enter after revealing = "Good"
        return;
      }
      const g = GRADES.find((x) => x.key === e.key);
      if (g) grade(g.value);
    }

    window.addEventListener('keydown', onKey);
    await load();
    return () => window.removeEventListener('keydown', onKey);
  },
};
