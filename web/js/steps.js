// The step list under the diagram: one line per thing that happened, with the real payload one click away.
import { t } from './i18n.js';

let list, counter, n = 0, lastTime = null;
const MAX_STEPS = 400;
const MAX_JSON = 8000;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function init(listEl, countEl) {
  list = listEl; counter = countEl;
  empty();
}

function empty() {
  list.innerHTML = `<li class="steps-empty">${esc(t('stepsEmpty'))}</li>`;
}

function stick() {
  return list.scrollHeight - list.scrollTop - list.clientHeight < 80;
}

function append(li) {
  const follow = stick();
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

/** phase: boot | mcp | llm | decision | route | result | answer | error. color: CSS color for the badge. */
export function add({ phase, badge, color, title, sub, json, at }) {
  n += 1;
  counter.textContent = String(n);
  const delta = lastTime && at ? `+${Math.max(0, Math.round((at - lastTime) * 1000))} ms` : '';
  if (at) lastTime = at;
  const li = document.createElement('li');
  li.className = `step phase-${phase}`;
  if (color) li.style.setProperty('--c', color);
  const payload = json === undefined ? '' : `
    <details><summary>${esc(t('payload'))}</summary><pre>${esc(pretty(json))}</pre></details>`;
  li.innerHTML = `
    <span class="n mono">${n}</span>
    <span class="badge mono">${esc(badge || phase)}</span>
    <div class="body">
      <div class="title">${title}</div>
      ${sub ? `<div class="sub mono">${esc(sub)}</div>` : ''}
      ${payload}
    </div>
    <span class="ms mono">${delta}</span>`;
  append(li);
  return li;
}

function pretty(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > MAX_JSON ? `${text.slice(0, MAX_JSON)}\n…` : text;
}

export { esc };
