// Small helpers used by every page. No frameworks — just the browser's DOM.

/**
 * Create an element:  h('button', { class: 'btn', onClick: fn }, 'Save')
 * Props starting with "on" become event listeners. Children can be strings,
 * elements, arrays, or null/false (skipped).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key.startsWith('data-') || key.startsWith('aria-') || !(key in el)) {
      el.setAttribute(key, value === true ? '' : value);
    } else {
      el[key] = value;
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** True on phones and tablets (a finger rather than a mouse). */
export const isTouch = () =>
  window.matchMedia('(pointer: coarse)').matches ||
  (navigator.maxTouchPoints > 0 && /Android|Mobi/i.test(navigator.userAgent));

/** Go to another page, e.g. navigate('/sets/3'). */
export function navigate(path) {
  location.hash = path;
}

/** Replace everything inside `parent` with the given children. */
export function mount(parent, ...children) {
  parent.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}

let toastTimer;
/** Show a short message at the bottom of the screen. */
export function toast(message, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/** Return a shuffled copy of an array. */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Format dollars: $1.25, or $0.0042 for tiny amounts. */
export function usd(n) {
  if (!n) return '$0.00';
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

/** "in 3 hours", "in 2 days"… for a future ISO date. */
export function timeFromNow(iso) {
  const min = Math.round((new Date(iso) - Date.now()) / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `in ${plural(min, 'minute')}`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `in ${plural(hours, 'hour')}`;
  return `in ${plural(Math.round(hours / 24), 'day')}`;
}

/** A small progress bar element with an update(fraction) method. */
export function progressBar() {
  const fill = h('div', { class: 'progress-fill' });
  const el = h('div', { class: 'progress', role: 'progressbar' }, fill);
  el.update = (fraction) => {
    fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  };
  return el;
}

/** Page title + optional actions on the right. */
export function pageHeader(title, subtitle, ...actions) {
  return h('div', { class: 'page-header' },
    h('div', {}, h('h1', {}, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
    actions.length ? h('div', { class: 'actions' }, actions) : null
  );
}
