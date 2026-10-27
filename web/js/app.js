// Wiring: host events (SSE) → a playback queue → diagram, steps and chat.
// Events arrive in milliseconds; the queue replays them at human speed, in order.
import * as chat from './chat.js';
import * as flow from './flow.js';
import { apply, getLang, list, setLang, t } from './i18n.js';
import { ICON } from './icons.js';
import * as steps from './steps.js';
import { code, esc } from './util.js';

const $ = (id) => document.getElementById(id);

let slow = false;
const speed = () => (slow ? 2.2 : 1);
const queue = [];
let playing = false;
let source = null;
let played = 0;  // seq of the last event handled
let seqWaiters = [];
let conversation = null;
let toolCount = 0;
let lastStatus = ['off', {}], lastNarration = ['nIdle', {}];
const inFlight = {};  // "server:jsonrpc-id" → the request packet still travelling (its response waits for it)

// --- status + narration -----------------------------------------------------------------------------

const STATUS_KEYS = { boot: 'stBoot', ready: 'stReady', down: 'stDown', busy: 'stBusy', off: 'stOff' };

function status(kind, params = {}) {
  lastStatus = [kind, params];
  $('status').dataset.kind = kind;
  $('status').querySelector('.label').textContent = t(STATUS_KEYS[kind], params);
}

function narrate(key, params = {}) {
  lastNarration = [key, params];
  $('now').textContent = t(key, params);
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
    try { await HANDLERS[event.kind]?.(event); } catch (e) { console.error(e); }
    played = event.seq;
    seqWaiters = seqWaiters.filter(({ seq, resolve }) => (seq <= played ? (resolve(), false) : true));
  }
  playing = false;
}

/** Resolves once the event `seq` has been played — or at once if the event stream is down. */
function playedUpTo(seq) {
  if (played >= seq || source?.readyState !== EventSource.OPEN) return Promise.resolve();
  return new Promise((resolve) => seqWaiters.push({ seq, resolve }));
}

// --- wire (real JSON-RPC over HTTP, observed by the host) -------------------------------------------

const who = (server) => `<span class="who">${esc(server)}</span>`;
const wireTitle = (arrow, e) => `${arrow} ${code(e.method)}${e.name ? ` ${code(e.name)}` : ''} ${who(e.server)}`;
const wireKey = (e) => `${e.server}:${e.body?.id}`;

function wireOut(e) {
  if (e.method === 'server/discover') narrate('nDiscover', { server: e.server });
  if (e.method === 'tools/list') narrate('nList', { server: e.server });
  steps.add({
    phase: 'mcp', badge: 'MCP', color: flow.colorOf(e.server), at: e.t, titleHtml: wireTitle('→', e),
    sub: `${e.http} · ${Object.entries(e.headers).map(([k, v]) => `${k}: ${v}`).join(' · ')}`, json: e.body,
  });
  const travel = flow.packet(e.server, 'fwd', e.name ? `${e.method} · ${e.name}` : e.method);
  if (e.method === 'tools/call') travel.then(() => flow.serverTool(e.server, e.name, 'running'));
  inFlight[wireKey(e)] = travel;
  return flow.sleep(180);  // parallel calls overlap on screen, like on the wire
}

async function wireIn(e) {
  await inFlight[wireKey(e)];
  delete inFlight[wireKey(e)];
  const result = e.body?.result || {};
  const failed = Boolean(e.body?.error || result.isError || e.status >= 400);
  let label = t('pktResult');
  if (e.method === 'server/discover') label = t('pktVersion', { v: (result.supportedVersions || [])[0] || '?' });
  if (e.method === 'tools/list') label = t('pktList', { n: (result.tools || []).length });
  if (e.method === 'tools/call' && failed) label = t('pktRefused');
  steps.add({ phase: 'mcp', badge: 'MCP', color: flow.colorOf(e.server), at: e.t, titleHtml: wireTitle('←', e),
    sub: `HTTP ${e.status} · ${e.ms} ms`, json: e.body });
  await flow.packet(e.server, 'back', label, { error: failed });
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
    steps.add({ phase: 'boot', badge: 'BOOT', at: e.t, title: t('bootStart', { n: Object.keys(e.servers).length }),
      json: e.servers });
    await flow.sleep(800);
  },

  async connect(e) {
    narrate('nConnect', { server: e.server });
    flow.edge(e.server, 'connecting');
    steps.add({ phase: 'boot', badge: 'BOOT', color: flow.colorOf(e.server), at: e.t,
      title: t('connect', { server: e.server }), sub: e.url });
    await flow.sleep(450);
  },

  wire: (e) => (e.dir === 'out' ? wireOut(e) : wireIn(e)),

  async server_ready(e) {
    flow.edge(e.server, 'live');
    flow.serverDiscovered(e.server, e);
    steps.add({ phase: 'discover', badge: 'DISCOVER', color: flow.colorOf(e.server), at: e.t,
      title: t('serverReady', { server: e.server, version: e.version, n: e.tools.length }), sub: e.instructions,
      json: e.tools });
    await flow.sleep(350);
  },

  async tools_registered(e) {
    narrate('nRegistered');
    steps.add({ phase: 'register', badge: 'REGISTER', color: flow.colorOf(e.server), at: e.t,
      title: t('registered', { n: e.tools.length }), json: e.tools });
    await flow.registerTools(e.server, e.tools);
  },

  async ready(e) {
    toolCount = e.tools.length;
    flow.llmSees(e.tools.map((x) => x.name));
    flow.setAgent('ready');
    status('ready', { n: toolCount });
    narrate('nReady', { n: toolCount });
    steps.add({ phase: 'ready', badge: 'READY', at: e.t, title: t('ready', { n: toolCount }) });
    chat.setEnabled(true);
  },

  async boot_error(e) {
    if (e.reason === 'unavailable') flow.serverDown(e.server);  // a name conflict is not the server's health
    flow.setAgent('off');
    status('down');
    narrate('nError', { text: e.error });
    steps.add({ phase: 'error', badge: 'ERROR', at: e.t, title: t('bootError', { server: e.server }), sub: e.error });
    chat.setEnabled(false);
  },

  async user(e) {
    flow.clearTurn();
    flow.setAgent('busy');
    status('busy');
    steps.section(t('secTurn'), e.text);
    narrate('nUser');
    steps.add({ phase: 'user', badge: 'USER', at: e.t, title: t('user'), sub: e.text });
    await flow.packet('user', 'fwd', t('pktMessage'));
  },

  async llm_request(e) {
    narrate('nLLM', { n: e.tools.length });
    steps.add({ phase: 'llm', badge: 'LLM', at: e.t, title: t('llmRequest', { round: e.round, n: e.tools.length }),
      json: { messages: e.messages, tools: e.tools } });
    await flow.packet('llm', 'fwd', t('pktFns', { n: e.tools.length }));
    flow.llmThinking(true);
  },

  async llm_decision(e) {
    flow.llmThinking(false);
    if (!e.tool_calls.length) {
      narrate('nDecisionText');
      steps.add({ phase: 'decision', badge: 'DECIDE', at: e.t, title: t('decisionText') });
      await flow.packet('llm', 'back', t('pktText'));
      return;
    }
    const names = e.tool_calls.map((c) => c.function.name);
    narrate('nDecisionTools', { list: list(names.map((n) => `${n}()`)) });
    steps.add({ phase: 'decision', badge: 'DECIDE', at: e.t,
      titleHtml: t('decisionTools', { list: list(names.map(code)) }), json: e.tool_calls });
    await flow.packet('llm', 'back', t('pktTools', { list: names.join(', ') }));
    flow.choose(names);
    await flow.sleep(300);
  },

  async tool_call(e) {
    flow.rowState(e.name, 'running');
    narrate('nRoute', { name: e.name, server: e.server });
    steps.add({ phase: 'route', badge: 'ROUTE', color: flow.colorOf(e.server), at: e.t,
      titleHtml: t('route', { name: code(e.name), server: who(e.server) }), sub: t('subCall'), json: e.arguments });
    await flow.sleep(350);
  },

  async tool_result(e) {
    if (!e.server) {
      steps.add({ phase: 'error', badge: 'BLOCKED', at: e.t, titleHtml: t('unknownTool', { name: code(e.name) }) });
      return;
    }
    flow.rowState(e.name, e.is_error ? 'err' : 'ok');
    narrate('nResult', { server: e.server });
    steps.add({ phase: 'result', badge: 'RESULT', color: flow.colorOf(e.server), at: e.t,
      titleHtml: t(e.is_error ? 'resultErr' : 'result', { name: code(e.name) }), json: e.result });
    await flow.sleep(250);
  },

  async answer(e) {
    if (e.error) narrate('nError', { text: e.text }); else narrate('nAnswer');
    steps.add({ phase: e.error ? 'error' : 'answer', badge: e.error ? 'ERROR' : 'ANSWER', at: e.t,
      title: t(e.error ? 'error' : 'answer'), sub: e.text });
    await flow.packet('user', 'back', t('pktAnswer'), { error: e.error });
    chat.addBot(e.text, { error: e.error });
    flow.setAgent('ready');
    flow.llmThinking(false);
    status('ready', { n: toolCount });
    chat.setBusy(false);
  },
};

// --- actions ------------------------------------------------------------------------------------------

async function send(text) {
  chat.addUser(text);
  chat.showTyping(true);
  chat.setBusy(true);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, conversation }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    conversation = data.conversation;
    // The animation shows the answer. Only if the event stream is down does the text come from here.
    const live = source?.readyState === EventSource.OPEN;
    await playedUpTo(data.seq);
    if (!live) { chat.addBot(data.text); chat.setBusy(false); }
  } catch (e) {
    chat.addBot(String(e.message || e), { error: true });
    chat.setBusy(false);
  }
}

async function boot() {
  try {
    await fetch('/api/boot', { method: 'POST' });
  } catch { /* the boot_error event tells the story */ }
}

function connectEvents() {
  return new Promise((resolve) => {
    source = new EventSource('/api/events');
    source.onopen = () => resolve();
    source.onmessage = (m) => enqueue(JSON.parse(m.data));
  });
}

function relabelAll() {
  apply();
  flow.relabel();
  chat.renderSuggestions();
  status(...lastStatus);
  narrate(...lastNarration);
  document.querySelectorAll('.lang').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}

async function main() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = ICON[el.dataset.icon]; });
  $('brand-mark').innerHTML = ICON.plug;
  const state = await (await fetch('/api/state')).json();
  flow.init($('flow'), { serverNames: Object.keys(state.servers), model: state.model, getSpeed: speed });
  flow.setPorts(state.servers);
  steps.init($('steps'), $('step-count'));
  chat.init({ messages: $('messages'), form: $('composer'), input: $('input'), send: $('send'),
    suggestions: $('suggestions') }, send);
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
