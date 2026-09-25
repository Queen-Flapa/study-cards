// Learn: each card is asked first as multiple choice, then as a typed answer.
// Get it wrong and it comes back a few questions later. Finish when every
// card has been answered correctly in both formats.
import { checkAnswer } from '../lib/answers.js';
import { h, mount, plural, shuffle } from '../ui.js';

const REQUEUE_GAP = 3; // a missed card comes back after this many other questions

export const learn = {
  id: 'learn',
  name: 'Learn',
  description: 'Multiple choice, then typed answers, until you get them all.',
  icon: '🎯',
  minCards: 2,

  start(container, set, ctx) {
    const settings = { promptWith: 'term', multipleChoice: true, written: true };
    let queue = [];   // items still to answer: { card, stage } (stage 0 = MC, 1 = written)
    let totalSteps = 0;
    let doneSteps = 0;
    let missed = new Set();
    let onKey = null; // keyboard handler for the current question

    const answerSide = () => (settings.promptWith === 'term' ? 'definition' : 'term');
    const stages = () => [settings.multipleChoice && 0, settings.written && 1].filter((s) => s !== false);

    function begin() {
      const st = stages();
      if (st.length === 0) settings.written = true;
      queue = shuffle(set.cards).map((card) => ({ card, stage: stages()[0] }));
      totalSteps = set.cards.length * stages().length;
      doneSteps = 0;
      missed = new Set();
      next();
    }

    function next() {
      ctx.setProgress(doneSteps / totalSteps);
      ctx.setStatus(`${doneSteps} / ${totalSteps} steps`);
      const item = queue.shift();
      if (!item) return finish();
      if (item.stage === 0) askMultipleChoice(item);
      else askWritten(item);
    }

    function correct(item) {
      doneSteps++;
      const st = stages();
      const nextStage = st[st.indexOf(item.stage) + 1];
      if (nextStage !== undefined) {
        // Put it back later in the queue for the next format.
        queue.splice(Math.min(queue.length, REQUEUE_GAP + 1), 0, { card: item.card, stage: nextStage });
      }
    }

    function wrong(item) {
      missed.add(item.card.id);
      queue.splice(Math.min(queue.length, REQUEUE_GAP), 0, item);
    }

    function promptBlock(item, label) {
      return h('div', { class: 'question' },
        h('span', { class: 'face-label' }, `${settings.promptWith} · ${label}`),
        h('p', { class: 'prompt' }, item.card[settings.promptWith]));
    }

    function askMultipleChoice(item) {
      const side = answerSide();
      const right = item.card[side];
      const others = shuffle([...new Set(set.cards.map((c) => c[side]).filter((a) => a !== right))]).slice(0, 3);
      const options = shuffle([right, ...others]);
      let answered = false;

      const buttons = options.map((opt, i) =>
        h('button', { class: 'option', onClick: () => choose(i) },
          h('span', { class: 'key' }, i + 1), h('span', {}, opt)));
      const feedback = h('div', { class: 'feedback' });

      function choose(i) {
        if (answered) return;
        answered = true;
        const isRight = options[i] === right;
        buttons.forEach((b, j) => {
          b.disabled = true;
          if (options[j] === right) b.classList.add('right');
          else if (j === i) b.classList.add('wrong');
        });
        if (isRight) {
          correct(item);
          feedback.replaceChildren(h('p', { class: 'good' }, 'Correct!'));
          setTimeout(next, 700);
        } else {
          wrong(item);
          continueButton(feedback, 'Not quite — study the right answer, then continue.');
        }
      }

      onKey = (e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length) choose(n - 1);
      };
      mount(container, promptBlock(item, 'choose the answer'), h('div', { class: 'options' }, buttons), feedback);
    }

    function askWritten(item) {
      const expected = item.card[answerSide()];
      const input = h('input', { class: 'input big', placeholder: `Type the ${answerSide()}`, autocomplete: 'off', spellcheck: false });
      const feedback = h('div', { class: 'feedback' });
      const form = h('form', { class: 'written', onSubmit: submit },
        input,
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn ghost', onClick: () => grade('') }, "Don't know"),
          h('button', { type: 'submit', class: 'btn primary' }, 'Answer')));

      function submit(e) {
        e.preventDefault();
        grade(input.value);
      }

      function grade(given) {
        input.disabled = true;
        form.querySelectorAll('button').forEach((b) => (b.disabled = true));
        const result = checkAnswer(given, expected);
        if (result === 'correct') {
          correct(item);
          feedback.replaceChildren(h('p', { class: 'good' }, 'Correct!'));
          setTimeout(next, 700);
          return;
        }
        if (result === 'accent') {
          correct(item);
          continueButton(feedback, `Correct — watch the accents: “${expected}”`, 'good');
          return;
        }
        wrong(item);
        feedback.replaceChildren(
          h('div', { class: 'compare' },
            h('p', {}, h('span', { class: 'muted small' }, 'Correct answer'), h('strong', { class: 'good' }, expected)),
            given ? h('p', {}, h('span', { class: 'muted small' }, 'You said'), h('span', { class: 'bad' }, given)) : null));
        const actions = h('div', { class: 'actions' },
          given ? h('button', { class: 'btn ghost', onClick: override }, 'I was right') : null);
        feedback.append(actions);
        continueButton(actions);

        function override() {
          // Undo the "wrong": take it back out of the queue and count it as correct.
          const at = queue.indexOf(item);
          if (at !== -1) queue.splice(at, 1);
          missed.delete(item.card.id);
          correct(item);
          next();
        }
      }

      onKey = null;
      mount(container, promptBlock(item, 'type the answer'), form, feedback);
      input.focus();
    }

    // Adds a "Continue" button (Enter also works) to `parent`.
    function continueButton(parent, message, tone = 'bad') {
      if (message) parent.replaceChildren(h('p', { class: tone }, message));
      const btn = h('button', { class: 'btn primary', onClick: () => next() }, 'Continue');
      parent.append(btn);
      onKey = null;
      setTimeout(() => {
        btn.focus();
        onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
      }, 50);
    }

    function finish() {
      ctx.setProgress(1);
      ctx.setStatus('Done');
      onKey = null;
      const struggled = set.cards.filter((c) => missed.has(c.id));
      mount(container, h('div', { class: 'summary' },
        h('h2', {}, `🎉 You learned all ${plural(set.cards.length, 'card')}!`),
        struggled.length
          ? h('div', {},
              h('p', { class: 'muted' }, `Worth another look (${struggled.length}):`),
              h('ul', { class: 'term-list compact' }, struggled.map((c) =>
                h('li', {}, h('div', { class: 'term' }, c.term), h('div', { class: 'definition' }, c.definition)))))
          : h('p', { class: 'muted' }, 'No mistakes. Impressive!'),
        h('div', { class: 'actions center' },
          h('button', { class: 'btn primary', onClick: begin }, 'Learn again'),
          h('a', { class: 'btn', href: `#/sets/${set.id}/study/review` }, 'Go to spaced review'))));
    }

    function renderSettings() {
      const check = (key, label) => h('label', {},
        h('input', { type: 'checkbox', checked: settings[key], onChange: (e) => {
          settings[key] = e.target.checked;
          if (!settings.multipleChoice && !settings.written) {
            settings[key === 'written' ? 'multipleChoice' : 'written'] = true;
          }
          renderSettings();
        } }), ` ${label}`);
      mount(container, h('div', { class: 'panel setup' },
        h('h2', {}, 'Set up your Learn session'),
        h('label', {}, 'Show me the ',
          h('select', { class: 'input inline', onChange: (e) => (settings.promptWith = e.target.value) },
            h('option', { value: 'term', selected: settings.promptWith === 'term' }, 'term'),
            h('option', { value: 'definition', selected: settings.promptWith === 'definition' }, 'definition')),
          ' and I answer with the other side'),
        check('multipleChoice', 'Multiple choice questions'),
        check('written', 'Written (typed) questions'),
        h('button', { class: 'btn primary big', onClick: begin }, `Start learning ${plural(set.cards.length, 'card')}`)));
    }

    const keyListener = (e) => {
      if (e.target.matches('input, textarea, select')) return;
      onKey?.(e);
    };
    window.addEventListener('keydown', keyListener);
    ctx.setStatus('');
    renderSettings();
    return () => window.removeEventListener('keydown', keyListener);
  },
};
