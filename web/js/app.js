// Wiring: host events (SSE) → a playback queue → diagram, steps and chat.
// Events arrive in milliseconds; the queue replays them at human speed, in order.
import * as chat from './chat.js';
import * as flow from './flow.js';
import { apply, getLang, list, setLang, t } from './i18n.js';
import { ICON } from './icons.js';
import * as steps from './steps.js';

const $ = (id) => document.getElementById(id);
const esc = steps.esc;
const code = (s) => `<code>${esc(s)}</code>`;

let slow = false;
const speed = () => (slow ? 2.2 : 1);
const queue = [];
let playing = false;
let idleWaiters = [];
let conversation = null;
let toolCount = 0;
let answered = true;
const outbound = {};  // server → promise of the request packet still travelling (its answer waits for it)

// --- status + narration -----------------------------------------------------------------------------

function status(kind, params = {}) {
  const el = $('status');
  el.dataset.kind = kind;
  el.querySelector('.label').textContent = t({ boot: 'stBoot', ready: 'stReady', down: 'stDown', busy: 'stBusy', off: 'stOff' }[kind], params);
  el.dataset.params = JSON.stringify(params);
}

function narrate(key, params = {}) {
  const el = $('now');
  el.dataset.key = key; el.dataset.params = JSON.stringify(params);
  el.textContent = t(key, params);
}

// --- queue ------------------------------------------------------------------------------------------

function enqueue(event) {
  queue.push(event);
  if (!playing) play();
}

async function play() {
  playing = true;
  while (queue.length) {
    const event = queue.shift();
    try { await (HANDLERS[event.kind] || (() => {}))(event); } catch (e) { console.error(e); }
  }
  playing = false;
  idleWaiters.forEach((resolve) => resolve());
  idleWaiters = [];
}

const whenIdle = () => (playing || queue.length ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());

// --- wire (real JSON-RPC over HTTP, observed by the host) -------------------------------------------

function wireOut(e) {
  const color = flow.colorOf(e.server);
  const label = e.name ? `${e.method} · ${e.name}` : e.method;
  if (e.method === 'server/discover') narrate('nDiscover', { server: e.server });
  if (e.method === 'tools/list') narrate('nList', { server: e.server });
  steps.add({
    phase: 'mcp', badge: 'MCP', color, at: e.t,
    title: `→ ${code(e.method)}${e.name ? ` ${code(e.name)}` : ''} <span class="who">${esc(e.server)}</span>`,
    sub: `${e.http} · ${Object.entries(e.headers || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}`,
    json: e.body,
  });
  const travel = flow.packet(e.server, 'fwd', label, color);
  if (e.method === 'tools/call') travel.then(() => flow.serverTool(e.server, e.name, 'running'));
  outbound[e.server] = travel;
  return flow.sleep(180);  // parallel calls overlap on screen, like on the wire
}

async function wireIn(e) {
  await outbound[e.server];
  const color = flow.colorOf(e.server);
  const result = e.body?.result || {};
  const failed = Boolean(e.body?.error || result.isError || e.status >= 400);
  let label = t('pktResult');
  if (e.method === 'server/discover') label = t('pktVersion', { v: (result.supportedVersions || [])[0] || '?' });
  if (e.method === 'tools/list') label = t('pktList', { n: (result.tools || []).length });
  if (e.method === 'tools/call' && failed) label = t('pktRefused');
  steps.add({
    phase: 'mcp', badge: 'MCP', color, at: e.t,
    title: `← ${code(e.method)}${e.name ? ` ${code(e.name)}` : ''} <span class="who">${esc(e.server)}</span>`,
    sub: `HTTP ${e.status} · ${e.ms} ms`,
    json: e.body,
  });
  await flow.packet(e.server, 'back', label, color, { error: failed });
  if (e.method === 'tools/call') flow.serverTool(e.server, e.name, failed ? 'err' : 'ok');
}

// --- event handlers -----------------------------------------------------------------------------------

const HANDLERS = {
  async boot_start(e) {
    chat.setEnabled(false);
    status('boot');
    steps.section(t('secBoot'));
    flow.reset();
    narrate('nBoot');
    steps.add({ phase: 'boot', badge: 'BOOT', at: e.t, title: esc(t('bootStart', { n: Object.keys(e.servers).length })),
      json: e.servers });
    await flow.sleep(800);
  },

  async connect(e) {
    narrate('nConnect', { server: e.server });
    flow.edge(e.server, 'connecting');
    steps.add({ phase: 'boot', badge: 'BOOT', color: flow.colorOf(e.server), at: e.t,
      title: esc(t('connect', { server: e.server })), sub: e.url });
    await flow.sleep(450);
  },

  wire: (e) => (e.dir === 'out' ? wireOut(e) : wireIn(e)),

  async server_ready(e) {
    flow.edge(e.server, 'live');
    flow.serverDiscovered(e.server, e);
    steps.add({ phase: 'discover', badge: 'DISCOVER', color: flow.colorOf(e.server), at: e.t,
      title: esc(t('serverReady', { server: e.server, version: e.version, n: e.tools.length })), sub: e.instructions,
      json: e.tools });
    await flow.sleep(350);
  },

  async tools_registered(e) {
    narrate('nRegistered');
    steps.add({ phase: 'register', badge: 'REGISTER', color: flow.colorOf(e.server), at: e.t,
      title: esc(t('registered', { n: e.tools.length })), json: e.tools.map((fn) => ({ type: 'function', function: fn })) });
    await flow.registerTools(e.server, e.tools);
  },

  async ready(e) {
    toolCount = e.tools.length;
    flow.llmSees(e.tools.map((x) => x.name));
    flow.setAgent('ready');
    status('ready', { n: toolCount });
    narrate('nReady', { n: toolCount });
    steps.add({ phase: 'ready', badge: 'READY', at: e.t, title: esc(t('ready', { n: toolCount })) });
    chat.setEnabled(true);
  },

  async boot_error(e) {
    flow.serverDown(e.server);
    flow.setAgent('off');
    status('down');
    narrate('bootError', { server: e.server });
    steps.add({ phase: 'error', badge: 'ERROR', at: e.t, title: esc(t('bootError', { server: e.server })), sub: e.error });
    chat.setEnabled(false);
  },

  async user(e) {
    flow.clearTurn();
    flow.setAgent('busy');
    status('busy');
    steps.section(t('secTurn'), e.text);
    narrate('nUser');
    steps.add({ phase: 'user', badge: 'USER', at: e.t, title: esc(t('user')), sub: e.text });
    await flow.packet('user', 'fwd', t('pktMessage'), 'var(--user)');
  },

  async llm_request(e) {
    narrate('nLLM', { n: e.tools.length });
    steps.add({ phase: 'llm', badge: 'LLM', color: 'var(--llm)', at: e.t,
      title: esc(t('llmRequest', { round: e.round, n: e.tools.length })),
      json: { messages: e.messages, tools: e.tools } });
    await flow.packet('llm', 'fwd', t('pktFns', { n: e.tools.length }), 'var(--llm)');
    flow.llmThinking(true);
  },

  async llm_decision(e) {
    flow.llmThinking(false);
    if (!e.tool_calls.length) {
      narrate('nDecisionText');
      steps.add({ phase: 'decision', badge: 'DECIDE', color: 'var(--llm)', at: e.t, title: esc(t('decisionText')) });
      await flow.packet('llm', 'back', t('pktText'), 'var(--llm)');
      return;
    }
    const names = e.tool_calls.map((c) => c.name);
    narrate('nDecisionTools', { list: list(names.map((n) => `${n}()`)) });
    steps.add({ phase: 'decision', badge: 'DECIDE', color: 'var(--llm)', at: e.t,
      title: t('decisionTools', { list: list(names.map(code)) }),
      json: e.tool_calls.map((c) => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })) });
    await flow.packet('llm', 'back', t('pktTools', { list: names.join(', ') }), 'var(--llm)');
    flow.choose(names);
    await flow.sleep(300);
  },

  async tool_call(e) {
    flow.rowState(e.name, 'running');
    narrate('nRoute', { name: e.name, server: e.server });
    steps.add({ phase: 'route', badge: 'ROUTE', color: flow.colorOf(e.server), at: e.t,
      title: t('route', { name: code(e.name), server: `<span class="who">${esc(e.server)}</span>` }),
      sub: t('subCall'), json: e.arguments });
    await flow.sleep(350);
  },

  async tool_result(e) {
    if (!e.server) {
      steps.add({ phase: 'error', badge: 'BLOCKED', at: e.t, title: t('unknownTool', { name: code(e.name) }) });
      return;
    }
    flow.rowState(e.name, e.is_error ? 'err' : 'ok');
    narrate('nResult', { server: e.server });
    steps.add({ phase: 'result', badge: 'RESULT', color: flow.colorOf(e.server), at: e.t,
      title: t(e.is_error ? 'resultErr' : 'result', { name: code(e.name) }), json: e.result });
    await flow.sleep(250);
  },

  async answer(e) {
    narrate('nAnswer');
    steps.add({ phase: 'answer', badge: 'ANSWER', at: e.t, title: esc(t('answer')), sub: e.text });
    await flow.packet('user', 'back', t('pktAnswer'), 'var(--user)');
    chat.addBot(e.text);
    answered = true;
    finishTurn();
  },

  async error(e) {
    steps.add({ phase: 'error', badge: 'ERROR', at: e.t, title: esc(t('error')), sub: e.text });
    narrate('error');
    $('now').textContent = e.text;
  },
};

function finishTurn() {
  flow.setAgent('ready');
  flow.llmThinking(false);
  status('ready', { n: toolCount });
  chat.setBusy(false);
}

// --- actions ------------------------------------------------------------------------------------------

async function send(text) {
  chat.addUser(text);
  chat.showTyping(true);
  chat.setBusy(true);
  answered = false;
  let data = null, failure = null;
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, conversation }),
    });
    data = await response.json();
    if (!response.ok) failure = data.error || `HTTP ${response.status}`;
    else conversation = data.conversation;
  } catch (e) {
    failure = String(e);
  }
  await new Promise((r) => setTimeout(r, 300));
  await whenIdle();  // the answer is shown by the animation; this is the fallback if the event stream dropped
  if (!answered) {
    chat.addBot(failure || data.text, { error: Boolean(failure) });
    finishTurn();
  }
}

async function boot() {
  try {
    await fetch('/api/boot', { method: 'POST' });
  } catch { /* the boot_error event tells the story */ }
}

function connectEvents() {
  return new Promise((resolve) => {
    const source = new EventSource('/api/events');
    source.onopen = () => resolve();
    source.onmessage = (m) => enqueue(JSON.parse(m.data));
  });
}

function relabelAll() {
  apply();
  flow.relabel();
  chat.renderSuggestions();
  const s = $('status');
  if (s.dataset.kind) status(s.dataset.kind, JSON.parse(s.dataset.params || '{}'));
  const now = $('now');
  if (now.dataset.key) narrate(now.dataset.key, JSON.parse(now.dataset.params || '{}'));
  document.querySelectorAll('.lang').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}

async function main() {
  setLang(getLang());
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICON[el.dataset.icon]; });
  $('brand-mark').innerHTML = ICON.plug;
  const state = await (await fetch('/api/state')).json();
  flow.init($('flow'), { serverNames: Object.keys(state.servers), model: state.model, getSpeed: speed });
  flow.setPorts(state.servers);
  steps.init($('steps'), $('step-count'));
  chat.init({ messages: $('messages'), form: $('composer'), input: $('input'), send: $('send'),
    suggestions: $('suggestions') }, send);
  status('off');
  narrate('nIdle');
  relabelAll();

  $('btn-slow').addEventListener('click', (e) => {
    slow = !slow;
    e.currentTarget.setAttribute('aria-pressed', String(slow));
  });
  $('btn-restart').addEventListener('click', boot);
  document.querySelectorAll('.lang').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); relabelAll(); }));

  await connectEvents();
  boot();  // replay the real discovery so the boot is on screen
}

main();
