// UI strings (PT · EN). The agent itself answers in whatever language the user writes.
const STR = {
  en: {
    subtitle: '1 agent · 2 MCP servers · live',
    chat: 'Chat', workflow: 'Workflow', steps: 'Steps', send: 'Send',
    restart: 'Restart agent', slow: 'Slow motion', placeholder: 'Ask about your plants…',
    stBoot: 'Booting', stReady: 'Ready · {n} tools', stDown: 'MCP server offline', stBusy: 'Working', stOff: 'Offline',
    suggestions: ['Do I need to water anything today?', 'How do I care for my fern?', 'I just watered the fern',
      'What is the weather for the next 3 days?'],
    you: 'You', chatUi: 'chat',
    llmSub: 'decides which function to call', llmSees: 'Sees {n} functions', llmNone: 'Sees no functions yet',
    llmBlind: 'no idea they live on MCP servers',
    agentTitle: 'Agent', agentRole: 'MCP host', agentSub: '{n} MCP clients',
    registryTitle: 'Tool registry', registryEmpty: 'empty: nothing discovered yet',
    mcpServer: 'MCP server', notDiscovered: 'tools unknown until tools/list',
    read: 'read', write: 'write',
    eChat: 'HTTP', eLLM: 'Chat Completions', eMCP: 'MCP · JSON-RPC over HTTP',
    agBoot: 'booting', agReady: 'ready', agBusy: 'working', agOff: 'offline',
    pktMessage: 'message', pktAnswer: 'answer', pktFns: '{n} functions', pktTools: 'tool_calls: {list}',
    pktText: 'text answer', pktResult: 'result', pktRefused: 'isError', pktVersion: 'version {v}', pktList: '{n} tools',
    secBoot: 'Boot', secTurn: 'Message',
    bootStart: 'Agent starts: it only knows {n} URLs', connect: 'Connect to {server}',
    subCall: 'runs on the server that owns the tool',
    serverReady: '{server}: protocol {version} · {n} tools',
    registered: '{n} MCP tools → {n} functions in the registry', ready: 'Ready: the LLM will see {n} functions',
    bootError: '{server} is unreachable',
    user: 'User message', llmRequest: 'Ask the LLM · round {round} · {n} functions',
    decisionTools: 'LLM chose {list}', decisionText: 'LLM answered, no tool needed',
    route: '{name} belongs to {server} → tools/call',
    result: '{name} returned', resultErr: '{name} refused (business error: the LLM reads it)',
    unknownTool: '{name}: no server publishes it, blocked by the host',
    answer: 'Answer to the user', error: 'Error',
    nBoot: 'The agent starts with no tools: it only knows where the MCP servers are.',
    nConnect: 'Connecting to {server}…',
    nDiscover: 'server/discover: {server} and the agent agree on the protocol version.',
    nList: 'tools/list: {server} says what it can do.',
    nRegistered: 'Each MCP tool becomes a plain function for the LLM: name, description, JSON Schema.',
    nReady: 'Ready. The LLM sees {n} functions and has no idea they live on MCP servers.',
    nUser: 'Your message goes to the agent.',
    nLLM: 'The agent sends the conversation and {n} function definitions to the LLM.',
    nDecisionTools: 'The LLM chose {list}. It only names functions: the host is the one that calls.',
    nDecisionText: 'The LLM has what it needs and writes the answer.',
    nRoute: 'The host looks up {name} in the registry: it belongs to {server}, so tools/call goes there.',
    nResult: '{server} answered. The result goes back to the LLM as the function\'s return value.',
    nAnswer: 'Answer delivered.', nIdle: 'Send a message to watch the agent decide.',
    nError: '{text}', stepsEmpty: 'Steps show up here as they happen.', payload: 'payload',
  },
  pt: {
    subtitle: '1 agente · 2 servidores MCP · ao vivo',
    chat: 'Chat', workflow: 'Fluxo', steps: 'Passos', send: 'Enviar',
    restart: 'Reiniciar agente', slow: 'Câmera lenta', placeholder: 'Pergunte sobre suas plantas…',
    stBoot: 'Iniciando', stReady: 'Pronto · {n} tools', stDown: 'Servidor MCP fora do ar', stBusy: 'Trabalhando', stOff: 'Desligado',
    suggestions: ['Preciso regar alguma planta hoje?', 'Como cuido da minha samambaia?', 'Acabei de regar a samambaia',
      'Como fica o tempo nos próximos 3 dias?'],
    you: 'Você', chatUi: 'chat',
    llmSub: 'decide qual função chamar', llmSees: 'Enxerga {n} funções', llmNone: 'Ainda não enxerga funções',
    llmBlind: 'não sabe que elas vivem em servidores MCP',
    agentTitle: 'Agente', agentRole: 'host MCP', agentSub: '{n} clientes MCP',
    registryTitle: 'Registro de tools', registryEmpty: 'vazio: nada descoberto ainda',
    mcpServer: 'servidor MCP', notDiscovered: 'tools desconhecidas até o tools/list',
    read: 'lê', write: 'grava',
    eChat: 'HTTP', eLLM: 'Chat Completions', eMCP: 'MCP · JSON-RPC sobre HTTP',
    agBoot: 'iniciando', agReady: 'pronto', agBusy: 'trabalhando', agOff: 'desligado',
    pktMessage: 'mensagem', pktAnswer: 'resposta', pktFns: '{n} funções', pktTools: 'tool_calls: {list}',
    pktText: 'resposta em texto', pktResult: 'resultado', pktRefused: 'isError', pktVersion: 'versão {v}', pktList: '{n} tools',
    secBoot: 'Inicialização', secTurn: 'Mensagem',
    bootStart: 'Agente inicia: só conhece {n} URLs', connect: 'Conectar ao {server}',
    subCall: 'roda no servidor dono da tool',
    serverReady: '{server}: protocolo {version} · {n} tools',
    registered: '{n} tools MCP → {n} funções no registro', ready: 'Pronto: o LLM vai enxergar {n} funções',
    bootError: '{server} está inacessível',
    user: 'Mensagem do usuário', llmRequest: 'Pergunta ao LLM · rodada {round} · {n} funções',
    decisionTools: 'LLM escolheu {list}', decisionText: 'LLM respondeu sem precisar de tool',
    route: '{name} pertence ao {server} → tools/call',
    result: '{name} retornou', resultErr: '{name} recusou (erro de negócio: o LLM lê)',
    unknownTool: '{name}: nenhum servidor publica, bloqueada pelo host',
    answer: 'Resposta ao usuário', error: 'Erro',
    nBoot: 'O agente começa sem nenhuma tool: só sabe onde estão os servidores MCP.',
    nConnect: 'Conectando ao {server}…',
    nDiscover: 'server/discover: {server} e o agente combinam a versão do protocolo.',
    nList: 'tools/list: {server} conta o que sabe fazer.',
    nRegistered: 'Cada tool MCP vira uma função comum para o LLM: nome, descrição e JSON Schema.',
    nReady: 'Pronto. O LLM enxerga {n} funções e não sabe que elas vivem em servidores MCP.',
    nUser: 'Sua mensagem chega ao agente.',
    nLLM: 'O agente manda a conversa e {n} definições de função para o LLM.',
    nDecisionTools: 'O LLM escolheu {list}. Ele só nomeia funções: quem chama é o host.',
    nDecisionText: 'O LLM já tem o que precisa e escreve a resposta.',
    nRoute: 'O host procura {name} no registro: pertence ao {server}, então o tools/call vai para lá.',
    nResult: '{server} respondeu. O resultado volta ao LLM como o retorno da função.',
    nAnswer: 'Resposta entregue.', nIdle: 'Mande uma mensagem para ver o agente decidir.',
    nError: '{text}', stepsEmpty: 'Os passos aparecem aqui conforme acontecem.', payload: 'payload',
  },
};

const stored = () => { try { return localStorage.getItem('lang'); } catch { return null; } };
const pick = (l) => (STR[l] ? l : 'en');
let lang = pick(stored() || (navigator.language || 'pt').slice(0, 2));
document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';

export const getLang = () => lang;

export function setLang(next) {
  lang = pick(next);
  try { localStorage.setItem('lang', lang); } catch { /* private mode */ }
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
}

export function t(key, params = {}) {
  const value = STR[lang][key] ?? STR.en[key] ?? key;
  if (typeof value !== 'string') return value;
  return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}

export const list = (items) => new Intl.ListFormat(lang, { type: 'conjunction' }).format(items);

export function apply(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
