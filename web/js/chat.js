// The chat panel: messages, suggestions, composer.
import { t } from './i18n.js';

let messages, form, input, send, suggestions, onSend, typing = null, enabled = false, busy = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Minimal, safe formatting: everything is escaped first, then **bold** and "- " bullets.
function format(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').split('\n');
  let html = '', inList = false;
  for (const line of lines) {
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    if (bullet && !inList) { html += '<ul>'; inList = true; }
    if (!bullet && inList) { html += '</ul>'; inList = false; }
    html += bullet ? `<li>${bullet[1]}</li>` : (line.trim() ? `<p>${line}</p>` : '');
  }
  return html + (inList ? '</ul>' : '');
}

export function init(els, handler) {
  ({ messages, form, input, send, suggestions } = els);
  onSend = handler;
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); }
  });
  renderSuggestions();
  update();
}

function submit(raw) {
  const text = raw.trim();
  if (!text || !enabled || busy) return;
  input.value = '';
  onSend(text);
}

export function renderSuggestions() {
  suggestions.innerHTML = '';
  for (const text of t('suggestions')) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'suggestion'; b.textContent = text;
    b.addEventListener('click', () => submit(text));
    suggestions.appendChild(b);
  }
  update();
}

function bubble(role, html, extra = '') {
  const div = document.createElement('div');
  div.className = `msg ${role} ${extra}`;
  div.innerHTML = html;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

export function addUser(text) { bubble('user', `<p>${esc(text)}</p>`); }

export function addBot(text, { error = false } = {}) {
  showTyping(false);
  bubble('bot', format(text), error ? 'error' : '');
}

export function showTyping(on) {
  if (on && !typing) typing = bubble('bot typing', '<span></span><span></span><span></span>');
  if (!on && typing) { typing.remove(); typing = null; }
}

export function setEnabled(value) { enabled = value; update(); }
export function setBusy(value) { busy = value; update(); }

function update() {
  const off = !enabled || busy;
  send.disabled = off;
  suggestions.querySelectorAll('button').forEach((b) => { b.disabled = off; });
}
