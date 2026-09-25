// Flashcards: flip cards, sort them into "know it" / "still learning",
// then go again with just the ones you're still learning.
import { h, isTouch, mount, plural, shuffle } from '../ui.js';

export const flashcards = {
  id: 'flashcards',
  name: 'Flashcards',
  description: 'Flip through cards and sort what you know.',
  icon: '🃏',
  minCards: 1,

  start(container, set, ctx) {
    let frontSide = 'term'; // which side shows first: 'term' or 'definition'
    let shuffled = false;
    let deck = [];         // cards in this round
    let index = 0;
    let flipped = false;
    let results = [];      // per card in this round: 'know' | 'learning'

    function newRound(cards) {
      deck = shuffled ? shuffle(cards) : [...cards];
      index = 0;
      flipped = false;
      results = [];
      render();
    }

    function answer(result) {
      if (index >= deck.length) return;
      results[index] = result;
      index++;
      flipped = false;
      render();
    }

    function undo() {
      if (index === 0) return;
      index--;
      results.length = index;
      flipped = false;
      render();
    }

    function flip() {
      if (swiped) { swiped = false; return; }
      if (index >= deck.length) return;
      flipped = !flipped;
      cardEl?.classList.toggle('flipped', flipped);
    }

    let cardEl = null;

    function render() {
      ctx.setProgress(index / deck.length);
      ctx.setStatus(`${Math.min(index + 1, deck.length)} / ${deck.length}`);
      if (index >= deck.length) return renderSummary();

      const card = deck[index];
      const back = frontSide === 'term' ? 'definition' : 'term';
      const known = results.filter((r) => r === 'know').length;
      const learning = results.length - known;

      cardEl = h('div', { class: 'flashcard', onClick: flip, role: 'button', tabindex: '0', 'aria-label': 'Flip card' },
        h('div', { class: 'flashcard-inner' },
          h('div', { class: 'face front' }, h('span', { class: 'face-label' }, frontSide), h('p', {}, card[frontSide])),
          h('div', { class: 'face back' }, h('span', { class: 'face-label' }, back), h('p', {}, card[back]))));

      mount(container,
        h('div', { class: 'fc-counts' },
          h('span', { class: 'count learning' }, `${learning} still learning`),
          h('span', { class: 'count know' }, `${known} know`)),
        cardEl,
        h('div', { class: 'fc-controls' },
          h('button', { class: 'btn round learning', onClick: () => answer('learning'), title: 'Still learning (←)' }, '✗'),
          h('button', { class: 'btn ghost', onClick: undo, disabled: index === 0, title: 'Undo (Backspace)' }, '↶ Undo'),
          h('button', { class: 'btn round know', onClick: () => answer('know'), title: 'Know it (→)' }, '✓')),
        h('div', { class: 'fc-options' },
          h('label', {}, h('input', { type: 'checkbox', checked: shuffled, onChange: (e) => { shuffled = e.target.checked; newRound(set.cards); } }), ' Shuffle'),
          h('label', {}, h('input', { type: 'checkbox', checked: frontSide === 'definition', onChange: (e) => { frontSide = e.target.checked ? 'definition' : 'term'; render(); } }), ' Show definition first')),
        h('p', { class: 'muted small center' }, isTouch()
          ? 'Tap to flip · swipe right if you know it · swipe left if you’re still learning'
          : 'Space or click to flip · ← still learning · → know it'));
      addSwipe(cardEl);
    }

    // Swipe support: the card follows your finger; let go past the threshold to answer.
    const SWIPE_PX = 70;
    let swiped = false;
    function addSwipe(el) {
      let startX = 0, startY = 0, dx = 0, tracking = false;
      el.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY; dx = 0; tracking = true; swiped = false;
        el.style.transition = 'none';
      }, { passive: true });
      el.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        dx = t.clientX - startX;
        const dy = t.clientY - startY;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) { tracking = false; el.style.transform = ''; return; } // scrolling
        el.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
        el.classList.toggle('swipe-know', dx > SWIPE_PX);
        el.classList.toggle('swipe-learning', dx < -SWIPE_PX);
      }, { passive: true });
      el.addEventListener('touchend', () => {
        if (!tracking) return;
        tracking = false;
        el.style.transition = '';
        if (Math.abs(dx) > SWIPE_PX) {
          swiped = true; // the tap that ends a swipe shouldn't also flip the card
          el.style.transform = `translateX(${dx > 0 ? 120 : -120}%) rotate(${dx > 0 ? 12 : -12}deg)`;
          el.style.opacity = '0';
          setTimeout(() => answer(dx > 0 ? 'know' : 'learning'), 180);
        } else {
          el.style.transform = '';
          el.classList.remove('swipe-know', 'swipe-learning');
        }
      });
    }

    function renderSummary() {
      cardEl = null;
      const stillLearning = deck.filter((_, i) => results[i] === 'learning');
      const known = deck.length - stillLearning.length;
      ctx.setStatus('Done');
      mount(container, h('div', { class: 'summary' },
        h('h2', {}, stillLearning.length ? 'Nice work — keep going!' : '🎉 You know all of them!'),
        h('p', { class: 'muted' }, `You know ${known} and are still learning ${plural(stillLearning.length, 'card')}.`),
        h('div', { class: 'actions center' },
          stillLearning.length
            ? h('button', { class: 'btn primary', onClick: () => newRound(stillLearning) }, `Keep reviewing ${plural(stillLearning.length, 'card')}`)
            : null,
          h('button', { class: 'btn', onClick: () => newRound(set.cards) }, 'Restart all cards'),
          h('button', { class: 'btn ghost', onClick: undo }, '↶ Back to last card'))));
    }

    function onKey(e) {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowRight') answer('know');
      else if (e.key === 'ArrowLeft') answer('learning');
      else if (e.key === 'Backspace') undo();
    }

    window.addEventListener('keydown', onKey);
    newRound(set.cards);
    return () => window.removeEventListener('keydown', onKey);
  },
};
