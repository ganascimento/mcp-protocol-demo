// The step list under the diagram: one line per thing that happened, with the real payload one click away.
import { t } from './i18n.js';
import { esc } from './util.js';

let list, counter, n = 0, lastTime = null;
const MAX_STEPS = 400;
const MAX_JSON = 8000;
const payloads = new WeakMap();  // <details> → its payload, pretty-printed only when opened

export function init(listEl, countEl) {
  list = listEl; counter = countEl;
  list.innerHTML = `<li class="steps-empty">${esc(t('stepsEmpty'))}</li>`;
  list.addEventListener('toggle', (e) => {
    const pre = e.target.open && payloads.has(e.target) && e.target.querySelector('pre');
    if (pre && !pre.textContent) pre.textContent = pretty(payloads.get(e.target));
  }, true);
}

function append(li) {
  const follow = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  list.querySelector('.steps-empty')?.remove();
  list.appendChild(li);
  while (list.children.length > MAX_STEPS) list.firstElementChild.remove();
  if (follow) list.scrollTop = list.scrollHeight;
}

export function section(label, detail = '') {
  const li = document.createElement('li');
  li.className = 'step-section';
  li.innerHTML = `<span>${esc(label)}</span>${detail ? `<em>${esc(detail)}</em>` : ''}`;
  lastTime = null;
  append(li);
}

/** title is text; titleHtml is trusted markup (already escaped). The badge colour comes from the phase (CSS)
 *  unless `color` is given (a server's colour). */
export function add({ phase, badge, color, title, titleHtml, sub, json, at }) {
  n += 1;
  counter.textContent = String(n);
  const delta = lastTime && at ? `+${Math.max(0, Math.round((at - lastTime) * 1000))} ms` : '';
  if (at) lastTime = at;
  const li = document.createElement('li');
  li.className = `step phase-${phase}`;
  if (color) li.style.setProperty('--c', color);
  li.innerHTML = `
    <span class="n mono">${n}</span>
    <span class="badge mono">${esc(badge)}</span>
    <div>
      <div class="title">${titleHtml ?? esc(title)}</div>
      ${sub ? `<div class="sub mono">${esc(sub)}</div>` : ''}
      ${json === undefined ? '' : `<details><summary>${esc(t('payload'))}</summary><pre></pre></details>`}
    </div>
    <span class="ms mono">${delta}</span>`;
  if (json !== undefined) payloads.set(li.querySelector('details'), json);
  append(li);
}

function pretty(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}\n…` : text;
}
