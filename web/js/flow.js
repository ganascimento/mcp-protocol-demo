// The workflow diagram: HTML nodes over an SVG of edges, packets travelling along the edges.
// Coordinates live in a 1000×560 space; the container keeps that aspect ratio, so % positions line up with the SVG.
import { ICON } from './icons.js';
import { t } from './i18n.js';

const VB = { w: 1000, h: 560 };
const SLOTS = [  // MCP servers, in the order the agent boots them
  { box: { x: 752, y: 14, w: 238, h: 246 }, path: 'M640,318 C700,318 692,137 752,137', color: 'var(--garden)', icon: 'leaf' },
  { box: { x: 752, y: 300, w: 238, h: 230 }, path: 'M640,440 C700,440 692,415 752,415', color: 'var(--weather)', icon: 'cloud' },
];
const FIXED = {
  user: { box: { x: 10, y: 334, w: 140, h: 96 }, path: 'M150,382 L300,382' },
  llm: { box: { x: 250, y: 8, w: 440, h: 158 }, path: 'M470,234 L470,166' },
  agent: { box: { x: 300, y: 234, w: 340, h: 296 } },
};
const BASE_MS = 900;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let root, layer, speed = () => 1;
const nodes = {}, edges = {}, servers = {}, rows = {};
let llmFns = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (box) => `left:${box.x / 10}%;top:${box.y / 5.6}%;width:${box.w / 10}%;height:${box.h / 5.6}%`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms * speed()));

export function colorOf(server) {
  return servers[server]?.color || 'var(--accent)';
}

export function init(container, { serverNames, model, getSpeed }) {
  root = container; speed = getSpeed;
  serverNames.forEach((name, i) => { servers[name] = { ...SLOTS[i % SLOTS.length], name, tools: [], version: null }; });

  const svgEdges = [
    ['user', FIXED.user.path, 'var(--user)', 'eChat', 250, 370],
    ['llm', FIXED.llm.path, 'var(--llm)', 'eLLM', 478, 188],
    ...serverNames.map((n) => [n, servers[n].path, servers[n].color, 'eMCP', null, null]),
  ];
  root.innerHTML = `
    <svg class="edges" viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="none" aria-hidden="true">
      ${svgEdges.map(([key, d, color]) => `<path class="edge idle" data-edge="${esc(key)}" d="${d}" style="--c:${color}"/>`).join('')}
    </svg>
    <div class="edge-label" style="left:22.5%;top:${366 / 5.6}%" data-i18n="eChat"></div>
    <div class="edge-label" style="left:48%;top:${200 / 5.6}%;transform:translate(0,-50%)" data-i18n="eLLM"></div>
    <div class="edge-label mcp" style="left:87.1%;top:${280 / 5.6}%" data-i18n="eMCP"></div>
    ${userNode()}${llmNode(model)}${agentNode()}
    ${serverNames.map(serverNode).join('')}
    <div class="packets"></div>`;
  layer = root.querySelector('.packets');
  root.querySelectorAll('[data-edge]').forEach((p) => { edges[p.dataset.edge] = p; });
  root.querySelectorAll('[data-node]').forEach((n) => { nodes[n.dataset.node] = n; });
  relabel();
}

function userNode() {
  return `<div class="node node-user" data-node="user" style="${pct(FIXED.user.box)};--c:var(--user)">
    <div class="node-head"><span class="ico">${ICON.user}</span><div><b data-i18n="you"></b><small data-i18n="chatUi"></small></div></div>
  </div>`;
}

function llmNode(model) {
  return `<div class="node node-llm" data-node="llm" style="${pct(FIXED.llm.box)};--c:var(--llm)">
    <div class="node-head"><span class="ico">${ICON.spark}</span>
      <div><b>LLM <span class="model mono">${esc(model)}</span></b><small data-i18n="llmSub"></small></div></div>
    <div class="llm-sees"><span class="sees-label"></span><span class="blind" data-i18n="llmBlind"></span></div>
    <div class="fn-chips"></div>
  </div>`;
}

function agentNode() {
  return `<div class="node node-agent" data-node="agent" style="${pct(FIXED.agent.box)};--c:var(--accent)">
    <div class="node-head"><span class="ico">${ICON.agent}</span>
      <div><b><span data-i18n="agentTitle"></span> · Fern</b><small class="agent-sub"></small></div>
      <span class="state" data-state="off"></span></div>
    <div class="registry-title"><span data-i18n="registryTitle"></span></div>
    <ul class="registry"><li class="empty" data-i18n="registryEmpty"></li></ul>
  </div>`;
}

function serverNode(name) {
  const s = servers[name];
  return `<div class="node node-server undiscovered" data-node="${esc(name)}" style="${pct(s.box)};--c:${s.color}">
    <div class="node-head"><span class="ico">${ICON[s.icon]}</span>
      <div><b class="mono">${esc(name)}</b><small><span data-i18n="mcpServer"></span> <span class="port"></span></small></div></div>
    <div class="meta" hidden><span class="version"></span><p class="instructions"></p></div>
    <ul class="server-tools"><li class="empty" data-i18n="notDiscovered"></li></ul>
  </div>`;
}

export function relabel() {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelector('.agent-sub').textContent = `${t('agentRole')} · ${t('agentSub', { n: Object.keys(servers).length })}`;
  root.querySelector('.sees-label').textContent = llmFns.length ? t('llmSees', { n: llmFns.length }) : t('llmNone');
  const state = nodes.agent.querySelector('.state');
  state.textContent = t({ off: 'agOff', boot: 'agBoot', ready: 'agReady', busy: 'agBusy' }[state.dataset.state]);
  root.querySelectorAll('.rw').forEach((el) => { el.textContent = t(el.dataset.rw); });
}

export function setPorts(urls) {
  for (const [name, url] of Object.entries(urls)) {
    const port = nodes[name]?.querySelector('.port');
    if (port) { try { port.textContent = `:${new URL(url).port}`; } catch { /* not a URL */ } }
  }
}

// --- states ------------------------------------------------------------------------------------------

export function reset() {
  layer.innerHTML = '';
  Object.values(edges).forEach((e) => { e.setAttribute('class', 'edge idle'); });
  nodes.agent.querySelector('.registry').innerHTML = `<li class="empty">${esc(t('registryEmpty'))}</li>`;
  Object.keys(rows).forEach((k) => delete rows[k]);
  for (const s of Object.values(servers)) {
    const node = nodes[s.name];
    node.className = 'node node-server undiscovered';
    node.querySelector('.meta').hidden = true;
    node.querySelector('.server-tools').innerHTML = `<li class="empty">${esc(t('notDiscovered'))}</li>`;
  }
  llmSees([]);
  setAgent('boot');
}

export function setAgent(state) {
  const el = nodes.agent.querySelector('.state');
  el.dataset.state = state;
  nodes.agent.classList.toggle('busy', state === 'busy' || state === 'boot');
  relabel();
}

export function edge(key, state) {
  edges[key]?.setAttribute('class', `edge ${state}`);
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
  node.querySelector('.server-tools').innerHTML = tools.map((tool) => `
    <li data-tool="${esc(tool.name)}"><span class="mono">${esc(tool.name)}</span>
      <span class="rw ${tool.read_only ? 'ro' : 'wr'}" data-rw="${tool.read_only ? 'read' : 'write'}">${esc(t(tool.read_only ? 'read' : 'write'))}</span></li>`).join('');
  pulse(node);
}

export async function registerTools(name, tools) {
  const list = nodes.agent.querySelector('.registry');
  list.querySelector('.empty')?.remove();
  for (const tool of tools) {
    const li = document.createElement('li');
    li.dataset.tool = tool.name;
    li.style.setProperty('--c', colorOf(name));
    li.innerHTML = `<span class="dot"></span><span class="mono name">${esc(tool.name)}</span><span class="owner mono">${esc(name)}</span><span class="mark"></span>`;
    list.appendChild(li);
    rows[tool.name] = li;
    requestAnimationFrame(() => li.classList.add('in'));
    nodes[name].querySelector(`[data-tool="${CSS.escape(tool.name)}"]`)?.classList.add('flash');
    await sleep(240);
  }
  setTimeout(() => nodes[name].querySelectorAll('.flash').forEach((el) => el.classList.remove('flash')), 600);
}

export function llmSees(names) {
  llmFns = names;
  nodes.llm.querySelector('.fn-chips').innerHTML = names.map((n) => `<span class="chip mono" data-fn="${esc(n)}">${esc(n)}()</span>`).join('');
  relabel();
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
  row.classList.remove('running', 'ok', 'err');
  if (state) row.classList.add(state);
  row.querySelector('.mark').innerHTML = state === 'ok' ? ICON.check : state === 'err' ? ICON.x : '';
}

export function serverTool(server, name, state) {
  const li = nodes[server]?.querySelector(`[data-tool="${CSS.escape(name)}"]`);
  if (!li) return;
  li.classList.remove('running', 'ok', 'err');
  if (state) li.classList.add(state);
}

export function clearTurn() {
  nodes.llm.querySelectorAll('.chip.chosen').forEach((c) => c.classList.remove('chosen'));
  Object.values(rows).forEach((r) => { r.classList.remove('chosen', 'running', 'ok', 'err'); r.querySelector('.mark').innerHTML = ''; });
  root.querySelectorAll('.server-tools li').forEach((li) => li.classList.remove('running', 'ok', 'err'));
}

function pulse(node) {
  node.classList.remove('pulse');
  void node.offsetWidth;  // restart the animation
  node.classList.add('pulse');
}

// --- packets -----------------------------------------------------------------------------------------

const active = {};

/** Moves a labelled packet along an edge. dir "fwd" = from the path's start (user→agent, agent→llm, agent→server). */
export function packet(key, dir, label, color, { error = false } = {}) {
  const path = edges[key];
  if (!path) return Promise.resolve();
  const length = path.getTotalLength();
  const el = document.createElement('div');
  el.className = `packet${error ? ' error' : ''}`;
  el.style.setProperty('--c', color);
  el.innerHTML = `<span>${esc(label)}</span>`;
  layer.appendChild(el);
  active[key] = (active[key] || 0) + 1;
  path.classList.add('active');
  const target = dir === 'fwd' ? (key === 'user' ? 'agent' : key === 'llm' ? 'llm' : key) : (key === 'user' ? 'user' : 'agent');
  const duration = BASE_MS * speed();

  const place = (at) => {
    const p = path.getPointAtLength(at);
    el.style.left = `${(p.x / VB.w) * 100}%`;
    el.style.top = `${(p.y / VB.h) * 100}%`;
  };

  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      if (--active[key] <= 0) path.classList.remove('active');
      const node = nodes[target];
      if (node) pulse(node);
      resolve();
    };
    if (reducedMotion.matches) {
      place(length / 2);
      setTimeout(done, duration * 0.6);
      return;
    }
    const start = performance.now();
    const frame = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      place(dir === 'fwd' ? eased * length : (1 - eased) * length);
      if (k < 1) requestAnimationFrame(frame); else done();
    };
    place(dir === 'fwd' ? 0 : length);
    requestAnimationFrame(frame);
    setTimeout(done, duration + 1500);  // a background tab throttles rAF: never stall the queue
  });
}
