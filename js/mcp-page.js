// "MCP": the career as a Model Context Protocol server.
// The console runs the server's own code (mcp-core.js) in the page, or the live Worker once js/config.js names it.

import { handleMcp, callTool, TOOLS, RESOURCES, PROMPTS, SERVER_INFO } from './mcp-core.js';
import { MCP_ENDPOINT } from './config.js';
import { initCursor } from './cursor.js';

initCursor('a,button,select,input,textarea');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = !!MCP_ENDPOINT;
const SITE = 'https://parth8.github.io/portfolio/';

let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  $('#csPane').textContent = 'The career record did not load, so the console cannot run. Reload, or read data/career.json directly.';
  throw new Error('career.json failed to load');
}

let toastT;
function toast(msg) {
  $('.copied')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="copied" role="status">${esc(msg)}</div>`);
  clearTimeout(toastT);
  toastT = setTimeout(() => $('.copied')?.remove(), 2000);
}
async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); } catch { prompt('Copy this:', text); }
}

/* ---------- endpoint ---------- */
if (LIVE) {
  $('#endpoint').classList.add('live');
  $('#epState').textContent = 'Live';
  $('#epUrl').textContent = MCP_ENDPOINT;
  $('#epCopy').hidden = false;
  $('#epCopy').addEventListener('click', () => copy(MCP_ENDPOINT, 'URL copied'));
  $('#consoleSub').textContent = 'This console talks to the live server. Pick a tool, send, and see exactly what your AI would read, down to the HTTP headers.';
}

/* ---------- the demo chat: real tool results, replies stitched from them ---------- */
const clip = (s, n = 150) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const tone = v => (/^(supported|excellent|strong)/i.test(v) ? 'ok' : /^(partial|differs|fair)/i.test(v) ? 'mid' : 'no');
const SCRIPTS = [
  () => {
    const jd = 'Senior Product Manager, Card Issuing. Own our card issuing platform and APIs for enterprise clients: card programs, processors, Visa and Mastercard, fraud and disputes, PCI and KYC compliance, and go-to-market with sales. 5+ years in fintech or payments.';
    const fit = callTool(data, 'fit_for', { job_description: jd }).structuredContent;
    const claim = callTool(data, 'prove_claim', { claim: '$2B+ a year in virtual card disbursements' }).structuredContent;
    const [a, b] = fit.matches;
    return [
      { you: 'Is Parth a fit for our Senior PM, Card Issuing role? Be honest about gaps.' },
      { tool: 'fit_for', args: 'job_description: "Senior Product Manager, Card Issuing…"', res: `${fit.band} · ${fit.score}/100 · ${fit.matches.length} matched · ${fit.gaps.length} gaps`, tone: tone(fit.band) },
      { tool: 'prove_claim', args: `claim: "${claim.claim}"`, res: claim.verdict, tone: tone(claim.verdict) },
      { ai: `${fit.band} fit, ${fit.score}/100, ${fit.gaps.length ? `with ${fit.gaps.length} gap${fit.gaps.length > 1 ? 's' : ''} to ask about` : 'with no gaps against this description'}. ${esc(a.label)}: “${esc(clip(a.evidence[0].quote))}”<sup>1</sup> ${esc(b.label)}: “${esc(clip(b.evidence[0].quote, 110))}”<sup>2</sup>`,
        cite: `1 ${a.evidence[0].title} · 2 ${b.evidence[0].title}` },
    ];
  },
  () => {
    const c = callTool(data, 'prove_claim', { claim: 'managed a team of 20 PMs' }).structuredContent;
    return [
      { you: 'His LinkedIn friend says he managed a team of 20 PMs. True?' },
      { tool: 'prove_claim', args: `claim: "${c.claim}"`, res: c.verdict, tone: tone(c.verdict) },
      { ai: `No. ${esc(c.explanation.replace(/^Not supported\.\s*/, ''))}`, cite: 'the record keeps its gaps on purpose' },
    ];
  },
  () => {
    const s = callTool(data, 'search_evidence', { query: 'Kafka', limit: 3 }).structuredContent.results;
    const g = callTool(data, 'get_work', { id: s[0].id }).structuredContent;
    return [
      { you: 'Has he actually worked with Kafka, or is it a buzzword?' },
      { tool: 'search_evidence', args: 'query: "Kafka"', res: `${s.length} quote${s.length === 1 ? '' : 's'} · top: ${s[0].title}`, tone: 'ok' },
      { tool: 'get_work', args: `id: "${s[0].id}"`, res: `${g.metric ? `${g.metric.value} ${g.metric.label}` : g.title}`, tone: 'ok' },
      { ai: `Yes, as the product owner of the pipeline. “${esc(clip(s[0].quote, 190))}”<sup>1</sup>`, cite: `1 ${s[0].title}` },
    ];
  },
];

const log = $('#demoLog');
let demoVisible = false;
new IntersectionObserver(([e]) => { demoVisible = e.isIntersecting; }, { threshold: 0.25 }).observe($('.demo'));
async function whenVisible() { while (!demoVisible || document.hidden) await sleep(300); }

function step(s) {
  const li = document.createElement('li');
  if (s.you) { li.className = 'dm dm-you'; li.textContent = s.you; }
  else if (s.tool) { li.className = 'dm dm-tool'; li.innerHTML = `→ <b>${esc(s.tool)}</b>(${esc(s.args)})<span class="dm-res">← <span class="${s.tone}">${esc(s.res)}</span></span>`; }
  else { li.className = 'dm dm-ai'; li.innerHTML = `${s.ai}<span class="cite">${esc(s.cite)}</span>`; }
  return li;
}
async function playDemo() {
  if (reduceMotion) { SCRIPTS[0]().forEach(s => log.append(step(s))); return; }
  for (let i = 0; ; i++) {
    const steps = SCRIPTS[i % SCRIPTS.length]();
    log.innerHTML = '';
    for (const s of steps) {
      await whenVisible();
      if (!s.you) {
        const dots = document.createElement('li');
        dots.className = 'dm-typing';
        dots.innerHTML = '<i></i><i></i><i></i>';
        log.append(dots);
        await sleep(s.tool ? 700 : 1100);
        dots.remove();
      }
      log.append(step(s));
      await sleep(s.you ? 600 : 900);
    }
    await sleep(6500);
  }
}
playDemo();

/* ---------- the console ---------- */
const JD = {
  card: 'Senior Product Manager, Card Issuing. Own our card issuing platform: virtual and physical cards, processor integrations and the APIs our enterprise clients build on. Work with compliance and risk to launch card programs in the US and Europe. 5+ years in fintech or payments; card networks (Visa, Mastercard), chargebacks and disputes, fraud controls, KYC and PCI DSS; webhooks; go-to-market with sales; SQL and dashboards.',
  ai: 'Product Manager, AI Platform (Forward Deployed). Own the platform that lets enterprise customers build agents on our APIs: tools over MCP, retrieval (RAG) and evaluation pipelines, and the call between open-weight and hosted models on cost, latency and accuracy. 4+ years on developer or platform products; hands-on with LLMs, prompt engineering, evals and guardrails; technical enough to prototype; regulated industries a plus.',
  growth: 'Director of Product, Consumer Growth. Lead and manage a team of 6 product managers across activation, retention and monetisation for our consumer app on iOS and Android. Own experimentation: A/B testing, funnels, growth loops. 10+ years of product experience, including 4+ years managing product managers.',
};
const PRESETS = {
  'tool:prove_claim': { field: 'claim', values: ['managed a team of 20 PMs', '0 P1/P2 defects at launch', '$3B a year in disbursements', 'built an MCP in 6 weeks'] },
  'tool:search_evidence': { field: 'query', values: ['Kafka', 'idempotency', 'Mastercard', 'golden dataset', 'passkeys'] },
  'tool:get_work': { field: 'id', values: ['connector-studio', 'Sparrow Card', 'track', 'zeta-tpgm'] },
  'tool:fit_for': { field: 'job_description', values: [['Card-issuing PM', JD.card], ['AI platform PM', JD.ai], ['Growth director', JD.growth]] },
  'prompt:assess_fit': { field: 'job_description', values: [['Card-issuing PM', JD.card], ['AI platform PM', JD.ai]] },
  'prompt:interview': { field: 'focus', values: ['payments', 'AI platforms', 'leadership'] },
};
const DEFAULTS = { 'tool:prove_claim': { claim: 'managed a team of 20 PMs' }, 'tool:search_evidence': { query: 'Kafka' }, 'tool:get_work': { id: 'connector-studio' }, 'tool:fit_for': { job_description: JD.ai } };

const fieldsFrom = schema => Object.entries(schema.properties || {}).map(([name, p]) => ({
  name, type: p.type, enum: p.enum, def: p.default, desc: p.description, required: (schema.required || []).includes(name), long: name === 'job_description',
}));
const ITEMS = [
  ...TOOLS.map(t => ({ key: `tool:${t.name}`, group: 'Tools', method: 'tools/call', name: t.name, label: t.name, sub: t.title, desc: t.description, fields: fieldsFrom(t.inputSchema), ann: t.annotations })),
  ...RESOURCES.map(r => ({ key: `res:${r.uri}`, group: 'Resources', method: 'resources/read', uri: r.uri, label: r.uri, sub: r.title, desc: r.description, fields: [] })),
  ...PROMPTS.map(p => ({ key: `prompt:${p.name}`, group: 'Prompts', method: 'prompts/get', name: p.name, label: p.name, sub: p.title, desc: p.description,
    fields: p.arguments.map(a => ({ name: a.name, type: 'string', desc: a.description, required: !!a.required, long: a.name === 'job_description' })) })),
  { key: 'm:server/discover', group: 'Protocol', method: 'server/discover', label: 'server/discover', sub: 'What this server is', desc: 'Supported versions, capabilities and the instructions your AI gets. In 2026-07-28 this replaces the initialize handshake.', fields: [] },
  { key: 'm:tools/list', group: 'Protocol', method: 'tools/list', label: 'tools/list', sub: 'Tool definitions', desc: 'Every tool with its JSON Schema and annotations, exactly as your AI receives them.', fields: [] },
  { key: 'm:resources/list', group: 'Protocol', method: 'resources/list', label: 'resources/list', sub: 'Readable documents', desc: 'The documents an AI can read in full: a plain resume, the profile and the whole record.', fields: [] },
  { key: 'm:prompts/list', group: 'Protocol', method: 'prompts/list', label: 'prompts/list', sub: 'Ready-made prompts', desc: 'Prompts a client can offer as one-click actions.', fields: [] },
];

const els = { list: $('#csList'), head: $('#csHead'), form: $('#csForm'), pane: $('#csPane'), status: $('#csStatus'), stamp: $('#csStamp'), history: $('#csHistory') };
const values = new Map(Object.entries(DEFAULTS).map(([k, v]) => [k, { ...v }]));
let current = ITEMS[0];
let view = 'reads';
let shown = null;
let proto = '2026-07-28';
let legacyReady = false;
let rid = 0;
const history = [];

let lastGroup = '';
els.list.innerHTML = ITEMS.map(it => {
  const g = it.group !== lastGroup ? `<p class="cs-group">${it.group}</p>` : '';
  lastGroup = it.group;
  return `${g}<button type="button" class="cs-item" data-key="${esc(it.key)}"><code>${esc(it.label)}</code><span>${esc(it.sub)}</span></button>`;
}).join('');

function select(key) {
  current = ITEMS.find(i => i.key === key) || ITEMS[0];
  for (const b of $$('.cs-item', els.list)) b.setAttribute('aria-current', String(b.dataset.key === current.key));
  const a = current.ann;
  els.head.innerHTML = `<h3><code>${esc(current.label)}</code><small>${esc(current.method)}</small></h3><p>${esc(current.desc)}</p>` +
    (a ? `<div class="badges"><span class="on">read-only</span><span class="${a.idempotentHint ? 'on' : ''}">idempotent</span><span>${a.destructiveHint ? 'destructive' : 'not destructive'}</span><span>${a.openWorldHint ? 'open world' : 'closed world'}</span></div>` : '');
  const vals = values.get(current.key) || {};
  const pre = PRESETS[current.key];
  els.form.innerHTML = current.fields.map(f => {
    const id = `f-${f.name}`;
    const label = `<label for="${id}"><b>${esc(f.name)}</b>${f.required ? ' <i>required</i>' : ''} · ${esc(f.desc || f.type)}</label>`;
    const v = vals[f.name] ?? f.def ?? '';
    let input;
    if (f.enum) input = `<select id="${id}" name="${esc(f.name)}">${f.enum.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (f.long) input = `<textarea id="${id}" name="${esc(f.name)}" spellcheck="false">${esc(v)}</textarea>`;
    else input = `<input id="${id}" name="${esc(f.name)}" type="${f.type === 'integer' ? 'number' : 'text'}" value="${esc(v)}">`;
    return `<div class="cs-field">${label}${input}</div>`;
  }).join('') +
    (pre ? `<div class="cs-presets"><span>Try</span>${pre.values.map((p, i) => `<button type="button" data-preset="${i}">${esc(Array.isArray(p) ? p[0] : p)}</button>`).join('')}</div>` : '') +
    `<div class="cs-send"><button class="cs-go" type="submit">Send <code>${esc(current.method)}</code> <span aria-hidden="true">↵</span></button><span class="cs-kbd"><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd></span></div>`;
  els.stamp.className = 'cs-stamp';
}

function readForm() {
  const out = {};
  for (const f of current.fields) {
    const el = els.form.elements[f.name];
    let v = el.value;
    if (f.type === 'integer') { if (v === '') continue; v = Number(v); }
    else if (!v.trim() && !f.required) continue;
    out[f.name] = v;
  }
  values.set(current.key, { ...out });
  return out;
}

els.list.addEventListener('click', e => {
  const b = e.target.closest('.cs-item');
  if (b) { readForm(); select(b.dataset.key); }
});
els.form.addEventListener('click', e => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const pre = PRESETS[current.key];
  const p = pre.values[+b.dataset.preset];
  els.form.elements[pre.field].value = Array.isArray(p) ? p[1] : p;
  send();
});
els.form.addEventListener('submit', e => { e.preventDefault(); send(); });
els.form.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });

for (const b of $$('.proto button')) b.addEventListener('click', () => {
  proto = b.dataset.proto;
  legacyReady = false;
  for (const x of $$('.proto button')) x.setAttribute('aria-checked', String(x === b));
  toast(proto === '2026-07-28' ? 'Stateless: no handshake' : 'Classic: initialize first');
});

/* transport: the live Worker when configured, otherwise the same handler in this page */
const META = 'io.modelcontextprotocol/';
const CLIENT = { name: 'parth-portfolio-console', version: '1.0.0' };
let liveOutdated = false;
async function exchange(method, params, { notify = false } = {}) {
  const modern = proto === '2026-07-28';
  const msg = { jsonrpc: '2.0', ...(notify ? {} : { id: ++rid }), method };
  const p = { ...(params || {}) };
  if (modern) p._meta = { [`${META}protocolVersion`]: proto, [`${META}clientInfo`]: CLIENT, [`${META}clientCapabilities`]: {} };
  if (Object.keys(p).length) msg.params = p;
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  if (modern) {
    headers['mcp-protocol-version'] = proto;
    if (!notify) headers['mcp-method'] = method;
    const name = method === 'resources/read' ? p.uri : ['tools/call', 'prompts/get'].includes(method) ? p.name : null;
    if (name) headers['mcp-name'] = name;
  } else if (method !== 'initialize') headers['mcp-protocol-version'] = proto;
  const body = JSON.stringify(msg);
  const t0 = performance.now();
  let res = null, where = 'in this page';
  if (LIVE && !liveOutdated) {
    try {
      const r = await fetch(MCP_ENDPOINT, { method: 'POST', headers, body });
      res = { status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() };
      where = 'live endpoint';
      // an endpoint deployed from an older build would contradict the rest of the site: run the current code instead
      const v = (() => { try { const j = JSON.parse(res.body); return (j.result?._meta?.[`${META}serverInfo`] || j.result?.serverInfo)?.version; } catch { return null; } })();
      if (v && parseInt(v, 10) < parseInt(SERVER_INFO.version, 10)) { liveOutdated = v; res = null; }
    } catch { where = 'in this page (endpoint unreachable)'; }
  }
  if (LIVE && liveOutdated) where = `in this page (the live endpoint runs older build ${liveOutdated})`;
  if (!res) res = handleMcp(data, { method: 'POST', headers, body });
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { /* not JSON */ }
  return { n: history.length + 1, label: method === 'tools/call' || method === 'prompts/get' ? p.name : method === 'resources/read' ? p.uri : method,
    method, proto, request: { headers, msg }, response: { status: res.status, headers: res.headers, json, raw: res.body }, ms: performance.now() - t0, where };
}

function record(x) {
  history.push(x);
  if (history.length > 14) history.shift();
  els.history.innerHTML = history.map(h => `<li><button type="button" data-n="${h.n}">#${h.n} ${esc(h.label)} <i class="${h.response.status >= 400 || h.response.json?.error || h.response.json?.result?.isError ? 'err' : ''}">${h.response.status}</i></button></li>`).join('');
}

const go = () => $('.cs-go', els.form);
async function send() {
  const params = {};
  const args = readForm();
  for (const f of current.fields) {
    if (f.required && !String(args[f.name] ?? '').trim()) { els.form.elements[f.name].focus(); toast(`${f.name} is required`); return; }
  }
  if (current.method === 'tools/call' || current.method === 'prompts/get') { params.name = current.name; params.arguments = args; }
  if (current.method === 'resources/read') params.uri = current.uri;
  go()?.classList.add('busy');
  try {
    if (proto !== '2026-07-28' && !legacyReady) {
      record(await exchange('initialize', { protocolVersion: proto, capabilities: {}, clientInfo: CLIENT }));
      record(await exchange('notifications/initialized', null, { notify: true }));
      legacyReady = true;
    }
    const x = await exchange(current.method, params);
    record(x);
    show(x);
  } finally { go()?.classList.remove('busy'); }
}

els.history.addEventListener('click', e => {
  const b = e.target.closest('[data-n]');
  if (b) show(history.find(h => h.n === +b.dataset.n));
});
for (const t of $$('.cs-tabs [role="tab"]')) t.addEventListener('click', () => {
  view = t.dataset.view;
  for (const x of $$('.cs-tabs [role="tab"]')) x.setAttribute('aria-selected', String(x === t));
  if (shown) show(shown, { flash: false });
});

/* rendering */
const hl = s => esc(s).replace(/(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,
  (m, str, colon, kw) => (str ? (colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`) : kw ? `<span class="j-b">${m}</span>` : `<span class="j-n">${m}</span>`));
const cut = (s, n = 9000) => (s.length > n ? `${s.slice(0, n)}\n\n… ${(s.length - n).toLocaleString()} more characters` : s);
const pretty = v => cut(JSON.stringify(v, null, 2));
const STATUS = { 200: 'OK', 202: 'Accepted', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 413: 'Payload Too Large', 429: 'Too Many Requests' };

function reads(x) {
  const j = x.response.json;
  if (!j) return `<span class="cs-hint">${x.response.status} ${STATUS[x.response.status] || ''}: no body. The server accepted the notification.</span>`;
  if (j.error) return `<span class="r-err">Error ${j.error.code}: ${esc(j.error.message)}</span>${j.error.data ? `\n\n${hl(pretty(j.error.data))}` : ''}`;
  const r = j.result;
  if (r.content) return `${r.isError ? '<span class="r-err">isError: true · the AI is told what to fix</span>\n\n' : ''}${esc(cut(r.content.map(c => c.text).join('\n\n')))}`;
  if (r.contents) return esc(cut(r.contents.map(c => c.text).join('\n\n')));
  if (r.messages) return esc(r.messages.map(m => `[${m.role}]\n${m.content.text}`).join('\n\n'));
  if (r.tools) return esc(r.tools.map(t => `${t.name}  ·  ${t.annotations?.readOnlyHint ? 'read-only' : 'writes'}\n  ${t.description}`).join('\n\n'));
  if (r.resources) return esc(r.resources.map(t => `${t.uri}  ·  ${t.mimeType}\n  ${t.description}`).join('\n\n'));
  if (r.prompts) return esc(r.prompts.map(t => `${t.name}(${t.arguments.map(a => a.name + (a.required ? '' : '?')).join(', ')})\n  ${t.description}`).join('\n\n'));
  if (r.capabilities) {
    const info = r.serverInfo || r._meta?.[`${META}serverInfo`] || {};
    return esc([`${info.title || info.name} · v${info.version}`, `Protocol: ${r.protocolVersion || (r.supportedVersions || []).join(', ')}`,
      `Capabilities: ${Object.keys(r.capabilities).join(', ')}`, '', 'Instructions for the AI:', r.instructions || ''].join('\n'));
  }
  return hl(pretty(r));
}
function structured(x) {
  const j = x.response.json;
  if (!j) return '<span class="cs-hint">No body.</span>';
  if (j.error) return hl(pretty(j));
  return hl(pretty(j.result.structuredContent ?? j.result));
}
function wire(x) {
  const host = LIVE && x.where === 'live endpoint' ? new URL(MCP_ENDPOINT) : null;
  const reqH = Object.entries({ host: host ? host.host : '(this page)', ...x.request.headers }).map(([k, v]) => `<span class="w-h">${esc(k)}:</span> ${esc(v)}`).join('\n');
  const resH = Object.entries(x.response.headers || {}).map(([k, v]) => `<span class="w-h">${esc(k)}:</span> ${esc(v)}`).join('\n');
  const st = x.response.status;
  return `<span class="w-l">POST ${esc(host ? host.pathname : '/mcp')} HTTP/1.1</span>\n${reqH}\n\n${hl(JSON.stringify(x.request.msg, null, 2))}\n\n` +
    `<span class="${st >= 400 ? 'w-e' : 'w-l'}">HTTP/1.1 ${st} ${STATUS[st] || ''}</span>\n${resH}\n\n${x.response.raw ? hl(cut(JSON.stringify(x.response.json, null, 2))) : '<span class="cs-hint">(empty body)</span>'}`;
}

function show(x, { flash = true } = {}) {
  shown = x;
  for (const b of $$('button', els.history)) b.setAttribute('aria-current', String(+b.dataset.n === x.n));
  const st = x.response.status;
  const bad = st >= 400 || x.response.json?.error || x.response.json?.result?.isError;
  els.status.innerHTML = `<b class="${bad ? 'err' : ''}">${st} ${STATUS[st] || ''}</b> · ${x.ms < 1 ? '<1' : Math.round(x.ms)} ms · ${esc(x.where)} · ${esc(x.proto)}`;
  els.pane.innerHTML = view === 'reads' ? reads(x) : view === 'json' ? structured(x) : wire(x);
  els.pane.scrollTop = 0;
  if (flash && !reduceMotion) { els.pane.classList.remove('flash'); void els.pane.offsetWidth; els.pane.classList.add('flash'); }
  // a rubber stamp for the two tools with a verdict
  const sc = x.response.json?.result?.structuredContent;
  const name = x.request.msg.params?.name;
  els.stamp.className = 'cs-stamp';
  if (sc && name === 'prove_claim') stamp(sc.verdict.replace(/_/g, ' '), `v-${sc.verdict}`);
  else if (sc && name === 'fit_for' && sc.score != null) stamp(`${sc.band} · ${sc.score}`, `v-${sc.band.toLowerCase()}`);
}
function stamp(text, cls) {
  els.stamp.textContent = text;
  els.stamp.classList.add(cls);
  requestAnimationFrame(() => requestAnimationFrame(() => els.stamp.classList.add('show')));
}

select(ITEMS.find(i => i.key === 'tool:prove_claim').key);

/* ---------- connect guides ---------- */
const EP = MCP_ENDPOINT || 'https://<endpoint going live soon>/mcp';
const ANY_PROMPT = `I'm considering Parth Aggarwal for a role. Read his machine-readable career record:
${SITE}data/career.json
(a short summary for AI readers is at ${SITE}llms.txt)

Answer only from that record. Cite the portfolio link for every claim, check numbers against the evidence lines, and say plainly when something isn't covered - the record lists his gaps on purpose.

The role:
[paste the job description]`;
const CURL = `curl -s ${EP} \\
  -H 'content-type: application/json' \\
  -H 'accept: application/json, text/event-stream' \\
  -H 'mcp-protocol-version: 2026-07-28' \\
  -H 'mcp-method: tools/call' \\
  -H 'mcp-name: prove_claim' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"prove_claim","arguments":{"claim":"0 P1/P2 defects"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"curl","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}}'`;
const TABS = [
  { id: 'any', label: 'Any AI', small: 'no setup', needsLive: false,
    steps: ['Copy the prompt. It works in any assistant that can open links.', 'Paste the job description where it says so.', 'Want tool calls and stricter citations? Connect the server with one of the other tabs.'],
    code: [['Paste into any assistant', ANY_PROMPT]] },
  { id: 'claude', label: 'Claude', small: 'web · desktop', needsLive: true,
    steps: ['Open <b>Settings → Connectors</b> and choose <b>Add custom connector</b>. On a Team or Enterprise plan, an owner adds it under <b>Admin settings → Connectors</b>.', 'Name it <b>Parth Aggarwal</b> and paste the URL. No sign-in, no keys.', 'In a chat, switch it on from the tools menu and ask.'],
    code: [['Server URL', EP], ['Then ask', 'Using the Parth Aggarwal connector: is he a fit for this role? Check every number with prove_claim.\n\n[paste the job description]']] },
  { id: 'code', label: 'Claude Code', small: 'terminal', needsLive: true,
    steps: ['Add the server once, from any project.', 'Check it with <code>/mcp</code>, then ask in plain words.'],
    code: [['Terminal', `claude mcp add --transport http parth ${EP}`], ['Then ask', 'Use parth to check: has he shipped MCP in production? Quote the evidence.']] },
  { id: 'cursor', label: 'Cursor', small: 'mcp.json', needsLive: true,
    steps: ['Open <b>Cursor Settings → MCP</b> and add a server, or edit <code>~/.cursor/mcp.json</code>.', 'Ask in the agent chat. Cursor lists the seven tools once it connects.'],
    code: [['~/.cursor/mcp.json', JSON.stringify({ mcpServers: { parth: { url: EP } } }, null, 2)]] },
  { id: 'chatgpt', label: 'ChatGPT', small: 'developer mode', needsLive: true,
    steps: ['In <b>Settings → Apps &amp; Connectors → Advanced settings</b>, turn on <b>Developer mode</b>. Availability depends on your plan.', 'Choose <b>Create</b>, paste the URL and pick <b>No authentication</b>.', 'Turn it on in a chat and ask.'],
    code: [['MCP server URL', EP]] },
  { id: 'other', label: 'Anything else', small: 'inspector · curl', needsLive: true,
    steps: ['Any client that speaks Streamable HTTP works. To poke at it, run the MCP Inspector and connect with transport <b>Streamable HTTP</b>.', 'Or use curl. This is a complete 2026-07-28 request: no handshake, the headers match the body.'],
    code: [['MCP Inspector', 'npx @modelcontextprotocol/inspector'], ['curl', CURL]] },
];
const pending = '<p class="cn-pending">The public endpoint isn\'t switched on yet. Until it is, use <b>Any AI</b> or the console above, which runs the same server code in this page.</p>';
$('#cnTabs').innerHTML = TABS.map((t, i) => `<button type="button" role="tab" id="cnt-${t.id}" aria-controls="cnp-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.label)}<small>${esc(t.small)}</small></button>`).join('');
$('#cnPanels').innerHTML = TABS.map((t, i) => `<div class="cn-panel" role="tabpanel" id="cnp-${t.id}" aria-labelledby="cnt-${t.id}"${i ? ' hidden' : ''}>
  <div>${t.needsLive && !LIVE ? pending : ''}<ol class="cn-steps">${t.steps.map(s => `<li>${s}</li>`).join('')}</ol></div>
  <div>${t.code.map(([title, text]) => `<div class="code"><div class="code-h"><span>${esc(title)}</span><button type="button" class="cp-btn" data-copy>Copy</button></div><pre>${esc(text)}</pre></div>`).join('')}</div>
</div>`).join('');
const cnTabs = $$('#cnTabs [role="tab"]');
function openTab(tab) {
  for (const t of cnTabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
  }
}
cnTabs.forEach((t, i) => {
  t.addEventListener('click', () => openTab(t));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const next = cnTabs[(i + d + cnTabs.length) % cnTabs.length];
    openTab(next); next.focus();
  });
});
$('#cnPanels').addEventListener('click', e => {
  const b = e.target.closest('[data-copy]');
  if (b) copy(b.closest('.code').querySelector('pre').textContent);
});
