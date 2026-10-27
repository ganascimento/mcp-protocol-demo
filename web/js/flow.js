// The workflow diagram: HTML nodes over an SVG of edges, packets travelling along the edges.
// Coordinates live in a 1000×560 space; the container keeps that aspect ratio, so % positions line up with the SVG.
import { ICON } from './icons.js';
import { apply, t } from './i18n.js';
import { delay, esc } from './util.js';

const VB = { w: 1000, h: 560 };
const SLOTS = [  // MCP servers, in the order the agent boots them
  { box: { x: 752, y: 14, w: 238, h: 246 }, path: 'M640,318 C700,318 692,137 752,137', color: 'var(--garden)', icon: 'leaf' },
  { box: { x: 752, y: 300, w: 238, h: 230 }, path: 'M640,440 C700,440 692,415 752,415', color: 'var(--weather)', icon: 'cloud' },
];
const BOXES = {
  user: { x: 10, y: 334, w: 140, h: 96 },
  llm: { x: 250, y: 8, w: 440, h: 158 },
  agent: { x: 300, y: 234, w: 340, h: 296 },
};
// Each edge goes from → to: a packet sent "fwd" travels that way, "back" the other way.
const FIXED_EDGES = {
  user: { path: 'M150,382 L300,382', from: 'user', to: 'agent', color: 'var(--user)' },
  llm: { path: 'M470,234 L470,166', from: 'agent', to: 'llm', color: 'var(--llm)' },
};
const LABELS = [['eChat', 225, 366], ['eLLM', 480, 200, 'start'], ['eMCP', 871, 280]];
const RUN_STATES = ['running', 'ok', 'err'];
const BASE_MS = 900;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let root, layer, speed = () => 1;
const nodes = {}, edges = {}, servers = {}, rows = {};
let agentState = 'off', llmCount = 0;

const pos = (x, y) => `left:${(x / VB.w) * 100}%;top:${(y / VB.h) * 100}%`;
const pct = (b) => `${pos(b.x, b.y)};width:${(b.w / VB.w) * 100}%;height:${(b.h / VB.h) * 100}%`;
const emptyRow = (key) => `<li class="empty" data-i18n="${key}">${esc(t(key))}</li>`;
export const sleep = (ms) => delay(ms * speed());

export function colorOf(server) {
  return servers[server]?.color || 'var(--accent)';
}

export function init(container, { serverNames, model, getSpeed }) {
  root = container; speed = getSpeed;
  serverNames.forEach((name, i) => { servers[name] = { ...SLOTS[i % SLOTS.length], name }; });
  const table = { ...FIXED_EDGES };
  for (const s of Object.values(servers)) table[s.name] = { path: s.path, from: 'agent', to: s.name, color: s.color };

  root.innerHTML = `
    <svg class="edges" viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="none" aria-hidden="true">
      ${Object.entries(table).map(([key, e]) => `<path class="edge ${FIXED_EDGES[key] ? 'live' : 'idle'}" data-edge="${esc(key)}" d="${e.path}" style="--c:${e.color}"/>`).join('')}
    </svg>
    ${LABELS.map(([key, x, y, anchor]) => `<div class="edge-label ${anchor || ''}" style="${pos(x, y)}" data-i18n="${key}"></div>`).join('')}
    ${userNode()}${llmNode(model)}${agentNode()}
    ${serverNames.map(serverNode).join('')}
    <div class="packets"></div>`;
  layer = root.querySelector('.packets');
  root.querySelectorAll('[data-node]').forEach((n) => { nodes[n.dataset.node] = n; });
  root.querySelectorAll('[data-edge]').forEach((p) => {
    edges[p.dataset.edge] = { ...table[p.dataset.edge], el: p, length: p.getTotalLength() };
  });
  relabel();
}

function userNode() {
  return `<div class="node node-user" data-node="user" style="${pct(BOXES.user)};--c:var(--user)">
    <div class="node-head"><span class="ico">${ICON.user}</span><div><b data-i18n="you"></b><small data-i18n="chatUi"></small></div></div>
  </div>`;
}

function llmNode(model) {
  return `<div class="node node-llm" data-node="llm" style="${pct(BOXES.llm)};--c:var(--llm)">
    <div class="node-head"><span class="ico">${ICON.spark}</span>
      <div><b>LLM <span class="model mono">${esc(model)}</span></b><small data-i18n="llmSub"></small></div></div>
    <div class="llm-sees"><span class="sees-label"></span><span class="blind" data-i18n="llmBlind"></span></div>
    <div class="fn-chips"></div>
  </div>`;
}

function agentNode() {
  return `<div class="node node-agent" data-node="agent" style="${pct(BOXES.agent)};--c:var(--accent)">
    <div class="node-head"><span class="ico">${ICON.agent}</span>
      <div><b><span data-i18n="agentTitle"></span> · Fern</b><small class="agent-sub"></small></div>
      <span class="state" data-state="off"></span></div>
    <div class="registry-title"><span data-i18n="registryTitle"></span></div>
    <ul class="registry">${emptyRow('registryEmpty')}</ul>
  </div>`;
}

function serverNode(name) {
  const s = servers[name];
  return `<div class="node node-server undiscovered" data-node="${esc(name)}" style="${pct(s.box)};--c:${s.color}">
    <div class="node-head"><span class="ico">${ICON[s.icon]}</span>
      <div><b class="mono">${esc(name)}</b><small><span data-i18n="mcpServer"></span> <span class="port"></span></small></div></div>
    <div class="meta" hidden><span class="version"></span><p class="instructions"></p></div>
    <ul class="server-tools">${emptyRow('notDiscovered')}</ul>
  </div>`;
}

/** Re-translates the diagram (language switch). */
export function relabel() {
  apply(root);
  root.querySelector('.agent-sub').textContent = `${t('agentRole')} · ${t('agentSub', { n: Object.keys(servers).length })}`;
  renderSees();
  renderState();
}

function renderSees() {
  nodes.llm.querySelector('.sees-label').textContent = llmCount ? t('llmSees', { n: llmCount }) : t('llmNone');
}

function renderState() {
  const el = nodes.agent.querySelector('.state');
  el.dataset.state = agentState;
  el.textContent = t({ off: 'agOff', boot: 'agBoot', ready: 'agReady', busy: 'agBusy' }[agentState]);
}

export function setPorts(urls) {
  for (const [name, url] of Object.entries(urls)) {
    const port = nodes[name]?.querySelector('.port');
    if (port) { try { port.textContent = `:${new URL(url).port}`; } catch { /* not a URL */ } }
  }
}

// --- states ------------------------------------------------------------------------------------------

function setRun(el, state) {
  if (!el) return;
  el.classList.remove(...RUN_STATES);
  if (state) el.classList.add(state);
}

const serverRow = (server, name) => nodes[server]?.querySelector(`[data-tool="${CSS.escape(name)}"]`);

export function reset() {
  layer.innerHTML = '';
  nodes.agent.querySelector('.registry').innerHTML = emptyRow('registryEmpty');
  Object.keys(rows).forEach((k) => delete rows[k]);
  for (const s of Object.values(servers)) {
    edge(s.name, 'idle');
    const node = nodes[s.name];
    node.className = 'node node-server undiscovered';
    node.querySelector('.meta').hidden = true;
    node.querySelector('.server-tools').innerHTML = emptyRow('notDiscovered');
  }
  llmSees([]);
  setAgent('boot');
}

export function setAgent(state) {
  agentState = state;
  nodes.agent.classList.toggle('busy', state === 'busy' || state === 'boot');
  renderState();
}

export function edge(key, state) {
  edges[key]?.el.setAttribute('class', `edge ${state}`);
}

export function serverDown(name) {
  nodes[name]?.classList.add('down');
  edge(name, 'down');
}

export function serverDiscovered(name, { version, instructions, tools }) {
  const node = nodes[name];
  node.classList.remove('undiscovered', 'down');
  node.querySelector('.version').textContent = `protocol ${version}`;
  node.querySelector('.instructions').textContent = instructions || '';
  node.querySelector('.meta').hidden = false;
  node.querySelector('.server-tools').innerHTML = tools.map((tool) => {
    const rw = tool.read_only ? 'read' : 'write';
    return `<li data-tool="${esc(tool.name)}"><span class="mono">${esc(tool.name)}</span>
      <span class="rw ${rw}" data-i18n="${rw}">${esc(t(rw))}</span></li>`;
  }).join('');
  pulse(node);
}

export async function registerTools(name, definitions) {
  const list = nodes.agent.querySelector('.registry');
  list.querySelector('.empty')?.remove();
  for (const { function: fn } of definitions) {
    const li = document.createElement('li');
    li.dataset.tool = fn.name;
    li.style.setProperty('--c', colorOf(name));
    li.innerHTML = `<span class="dot"></span><span class="mono name">${esc(fn.name)}</span><span class="owner mono">${esc(name)}</span><span class="mark"></span>`;
    list.appendChild(li);
    rows[fn.name] = li;
    requestAnimationFrame(() => li.classList.add('in'));
    serverRow(name, fn.name)?.classList.add('flash');
    await sleep(240);
  }
  setTimeout(() => nodes[name].querySelectorAll('.flash').forEach((el) => el.classList.remove('flash')), 600);
}

export function llmSees(names) {
  llmCount = names.length;
  nodes.llm.querySelector('.fn-chips').innerHTML = names.map((n) => `<span class="chip mono" data-fn="${esc(n)}">${esc(n)}()</span>`).join('');
  renderSees();
}

export function llmThinking(on) {
  nodes.llm.classList.toggle('thinking', on);
}

export function choose(names) {
  nodes.llm.querySelectorAll('.chip').forEach((c) => c.classList.toggle('chosen', names.includes(c.dataset.fn)));
  for (const n of names) rows[n]?.classList.add('chosen');
}

export function rowState(name, state) {
  const row = rows[name];
  if (!row) return;
  setRun(row, state);
  row.querySelector('.mark').innerHTML = state === 'ok' ? ICON.check : state === 'err' ? ICON.x : '';
}

export function serverTool(server, name, state) {
  setRun(serverRow(server, name), state);
}

export function clearTurn() {
  nodes.llm.querySelectorAll('.chip.chosen').forEach((c) => c.classList.remove('chosen'));
  Object.keys(rows).forEach((name) => { rows[name].classList.remove('chosen'); rowState(name, null); });
  root.querySelectorAll('.server-tools li').forEach((li) => setRun(li, null));
}

function pulse(node) {
  node.classList.remove('pulse');
  void node.offsetWidth;  // restart the animation
  node.classList.add('pulse');
}

// --- packets -----------------------------------------------------------------------------------------

const active = {};

/** Moves a labelled packet along an edge, "fwd" (from → to) or "back". Resolves when it arrives. */
export function packet(key, dir, label, { error = false } = {}) {
  const e = edges[key];
  if (!e) return Promise.resolve();
  const el = document.createElement('div');
  el.className = 'packet';
  el.style.setProperty('--c', error ? 'var(--error)' : e.color);
  el.innerHTML = `<span>${esc(label)}</span>`;
  layer.appendChild(el);
  active[key] = (active[key] || 0) + 1;
  e.el.classList.add('active');
  const duration = BASE_MS * speed();
  const place = (at) => {
    const p = e.el.getPointAtLength(at);
    el.style.left = `${(p.x / VB.w) * 100}%`;
    el.style.top = `${(p.y / VB.h) * 100}%`;
  };

  return new Promise((resolve) => {
    // Time decides when it arrives; animation frames only paint (a background tab throttles them).
    let arrived = false;
    setTimeout(() => {
      arrived = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      if (--active[key] <= 0) e.el.classList.remove('active');
      pulse(nodes[dir === 'fwd' ? e.to : e.from]);
      resolve();
    }, reducedMotion.matches ? duration * 0.6 : duration);
    if (reducedMotion.matches) { place(e.length / 2); return; }
    const start = performance.now();
    const frame = (now) => {
      if (arrived) return;
      const k = Math.min(1, (now - start) / duration);
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      place((dir === 'fwd' ? eased : 1 - eased) * e.length);
      requestAnimationFrame(frame);
    };
    place(dir === 'fwd' ? 0 : e.length);
    requestAnimationFrame(frame);
  });
}
