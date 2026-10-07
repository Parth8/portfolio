// "MCP": the career as a Model Context Protocol server.
// One interview room: a real session replays until you ask something, then your questions go through the
// server's own code (mcp-core.js) in the page, or the live Worker once js/config.js names it.

import { handleMcp, callTool, TOOLS, RESOURCES, PROMPTS, SERVER_INFO } from './mcp-core.js';
import { MCP_ENDPOINT } from './config.js';
import { initCursor } from './cursor.js';

initCursor('a,button,select,input,textarea,.cart');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = !!MCP_ENDPOINT;
const SITE = 'https://parth8.github.io/portfolio/';
const chat = $('#chat');

let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  chat.innerHTML = '<li class="msg sys">The career record did not load, so the room cannot run. Reload, or read data/career.json directly.</li>';
  throw new Error('career.json failed to load');
}

let toastT;
function toast(msg) {
  $('.toast-x')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast-x" role="status">${esc(msg)}</div>`);
  clearTimeout(toastT);
  toastT = setTimeout(() => $('.toast-x')?.remove(), 2000);
}
async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); } catch { prompt('Copy this:', text); }
}

/* ---------- job posts the room and the demo use ---------- */
const JD = {
  card: 'Senior Product Manager, Card Issuing. Own our card issuing platform: virtual and physical cards, processor integrations and the APIs our enterprise clients build on. Work with compliance and risk to launch card programs in the US and Europe. 5+ years in fintech or payments; card networks (Visa, Mastercard), chargebacks and disputes, fraud controls, KYC and PCI DSS; webhooks; go-to-market with sales; SQL and dashboards.',
  ai: 'Product Manager, AI Platform (Forward Deployed). Own the platform that lets enterprise customers build agents on our APIs: tools over MCP, retrieval (RAG) and evaluation pipelines, and the call between open-weight and hosted models on cost, latency and accuracy. 4+ years on developer or platform products; hands-on with LLMs, prompt engineering, evals and guardrails; technical enough to prototype; regulated industries a plus.',
  growth: 'Director of Product, Consumer Growth. Lead and manage a team of 6 product managers across activation, retention and monetisation for our consumer app on iOS and Android. Own experimentation: A/B testing, funnels, growth loops. 10+ years of product experience, including 4+ years managing product managers.',
};

/* ---------- plain words -> the right tool ---------- */
function route(text) {
  const raw = text.trim();
  const q = raw.replace(/\s+/g, ' ').replace(/[?.!]+$/, '').trim();
  if (raw.length >= 220 || raw.split('\n').length >= 4) return { tool: 'fit_for', args: { job_description: raw } };
  if (/\b(fit|match|good hire|right (?:person|hire)|suit(?:ed|able))\b/i.test(q) && /\b(for|as|role|job|position)\b/i.test(q)) return { tool: 'fit_for', args: { job_description: q } };
  if (/\b(contact|reach him|email him|get in touch|hire him|is he (?:open|available)|availability)\b/i.test(q)) return { tool: 'contact', args: {} };
  if (/^(?:who(?: is|'s) (?:he|parth)|about (?:him|parth)|tl;?dr|intro(?:duce him)?|summari[sz]e (?:him|parth))$/i.test(q)) return { tool: 'get_profile', args: {} };
  if (/^(?:what (?:has|did) he (?:build|built|ship|shipped|do|done|work(?:ed)? on)|list (?:his )?(?:work|projects|cases)|(?:his )?(?:projects|work|cases))$/i.test(q)) return { tool: 'list_work', args: {} };
  let m = q.match(/^(?:has|does|did|can|could|is)\s+(?:he|parth)\s+(?:ever\s+|actually\s+|really\s+)*(?:worked? (?:with|on|in)|used?|knows?|done|do|built|build|shipped|handled?|touched|(?:good|strong|experienced|hands-on) (?:at|with|in)|have (?:any )?experience (?:with|in))\s+(.+)$/i)
    || q.match(/^(?:any |what(?:'s| is) his )?experience (?:with|in)\s+(.+)$/i)
    || q.match(/^(?:search(?: for)?|find|look (?:up|for))\s+(.+)$/i);
  if (m) return { tool: 'search_evidence', args: { query: m[1].replace(/^(?:a|an|the|any)\s+/i, '') } };
  m = q.match(/^(?:tell me (?:more )?about|what (?:is|was)|walk me through|describe|explain|more on|show me|open)\s+(?:the\s+|his\s+)?(.+)$/i);
  if (m) return { tool: 'get_work', args: { id: m[1] }, fallback: m[1] };
  m = q.match(/^(?:is it true(?: that)?|true or false:?|did he (?:really )?|was he|is he|has he(?: ever)?|can you (?:verify|check|confirm)(?: that)?|verify(?: that)?|check(?: that)?|confirm(?: that)?|claim:?|fact.?check:?)\s*(.+)$/i);
  if (m) return { tool: 'prove_claim', args: { claim: m[1] } };
  if (/[\d$%]/.test(q) && q.split(' ').length >= 2) return { tool: 'prove_claim', args: { claim: q } };
  return { tool: 'search_evidence', args: { query: q } };
}

/* ---------- transport: the live Worker when configured, otherwise the same handler in this page ---------- */
const META = 'io.modelcontextprotocol/';
const CLIENT = { name: 'parth-portfolio-console', version: '2.0.0' };
let proto = '2026-07-28', legacyReady = false, rid = 0, liveOutdated = false;
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
    if (method === 'tools/call') headers['mcp-name'] = p.name;
  } else if (method !== 'initialize') headers['mcp-protocol-version'] = proto;
  const body = JSON.stringify(msg);
  const t0 = performance.now();
  let res = null, where = 'in this page';
  if (LIVE && !liveOutdated) {
    try {
      const r = await fetch(MCP_ENDPOINT, { method: 'POST', headers, body });
      res = { status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() };
      where = 'live server';
      // a server deployed from an older build would contradict the rest of the site: run the current code instead
      const v = (() => { try { const j = JSON.parse(res.body); return (j.result?._meta?.[`${META}serverInfo`] || j.result?.serverInfo)?.version; } catch { return null; } })();
      if (v && parseInt(v, 10) < parseInt(SERVER_INFO.version, 10)) { liveOutdated = v; res = null; }
    } catch { where = 'in this page (server unreachable)'; }
  }
  if (LIVE && liveOutdated) where = `in this page · live server is on older build ${liveOutdated}`;
  if (!res) res = handleMcp(data, { method: 'POST', headers, body });
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { /* not JSON */ }
  return { request: { headers, msg }, response: { status: res.status, headers: res.headers, json }, ms: performance.now() - t0, where };
}
async function call(tool, args) {
  const wires = [];
  if (proto !== '2026-07-28' && !legacyReady) {
    wires.push(await exchange('initialize', { protocolVersion: proto, capabilities: {}, clientInfo: CLIENT }));
    wires.push(await exchange('notifications/initialized', null, { notify: true }));
    legacyReady = true;
  }
  const x = await exchange('tools/call', { name: tool, arguments: args });
  wires.push(x);
  return { x, wires };
}

/* ---------- reading what came back ---------- */
const tone = v => (/^(supported|excellent|strong)/i.test(v) ? 'ok' : /^(partial|differs|fair|good)/i.test(v) ? 'mid' : 'no');
function verdictOf(tool, r) {
  const sc = r?.structuredContent;
  if (!r || r.isError || !sc) return { res: 'nothing on record', tone: 'no' };
  switch (tool) {
    case 'prove_claim': return { res: sc.verdict.replace(/_/g, ' '), tone: tone(sc.verdict), stamp: sc.verdict.replace(/_/g, ' ') };
    case 'fit_for': return sc.score == null ? { res: 'no requirements found', tone: 'no' }
      : { res: `${sc.band} · ${sc.score}/100`, tone: tone(sc.band), stamp: `${sc.band} · ${sc.score}` };
    case 'search_evidence': {
      const n = sc.results.length;
      return n ? { res: `${n} quote${n > 1 ? 's' : ''}`, tone: 'ok', stamp: `${n} quote${n > 1 ? 's' : ''}` } : { res: 'nothing found', tone: 'no', stamp: 'No match' };
    }
    case 'get_work': return { res: sc.title, tone: 'ok', stamp: 'On record' };
    case 'list_work': return { res: `${sc.results.length} items`, tone: 'ok' };
    case 'get_profile': return { res: sc.headline || sc.name, tone: 'ok' };
    case 'contact': return { res: sc.email, tone: 'ok' };
    default: return { res: 'ok', tone: 'ok' };
  }
}

// the text an AI reads, lightly set for people: **bold**, [links](url), "- " lists, "quotes"
function md(text) {
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/&quot;(.{12,}?)&quot;/g, '<q>$1</q>');
  let html = '', depth = 0;
  const close = to => { while (depth > to) { html += '</ul>'; depth--; } };
  for (const raw of text.split('\n')) {
    const m = raw.match(/^(\s*)- (.*)$/);
    if (m) {
      const d = m[1].length >= 2 ? 2 : 1;
      while (depth < d) { html += '<ul>'; depth++; }
      close(d);
      html += `<li>${inline(m[2])}</li>`;
    } else {
      close(0);
      if (raw.trim()) html += `<p>${inline(raw.replace(/^##\s*/, ''))}</p>`;
    }
  }
  close(0);
  return html;
}
const STATUS = { 200: 'OK', 202: 'Accepted', 400: 'Bad Request', 404: 'Not Found', 429: 'Too Many Requests' };
const hl = s => esc(s).replace(/(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?\b/g,
  (m, str, colon, kw) => (str ? (colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`) : kw ? `<span class="j-b">${m}</span>` : `<span class="j-n">${m}</span>`));
const cut = (s, n = 6000) => (s.length > n ? `${s.slice(0, n)}\n… ${(s.length - n).toLocaleString()} more characters` : s);
function wireText(wires) {
  return wires.map(x => {
    const reqH = Object.entries(x.request.headers).map(([k, v]) => `<span class="w-h">${esc(k)}:</span> ${esc(v)}`).join('\n');
    const resH = Object.entries(x.response.headers || {}).map(([k, v]) => `<span class="w-h">${esc(k)}:</span> ${esc(v)}`).join('\n');
    const st = x.response.status;
    return `<span class="w-l">POST /mcp HTTP/1.1</span>\n${reqH}\n\n${hl(JSON.stringify(x.request.msg, null, 2))}\n\n<span class="${st >= 400 ? 'w-e' : 'w-l'}">HTTP/1.1 ${st} ${STATUS[st] || ''}</span>\n${resH}${x.response.json ? `\n\n${hl(cut(JSON.stringify(x.response.json, null, 2)))}` : ''}`;
  }).join('\n\n<span class="w-h">──────────</span>\n\n');
}

/* ---------- the chat ---------- */
const clip = (s, n = 150) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const argText = args => Object.entries(args).map(([k, v]) => `${k}: "${clip(String(v), 46)}"`).join(', ');
function li(cls, html) {
  const el = document.createElement('li');
  el.className = `msg ${cls}`;
  el.innerHTML = html;
  chat.append(el);
  return el;
}
const toBottom = () => chat.scrollTo({ top: chat.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
function you(text, attach) {
  return li('you', `<span class="you-t">${esc(text)}</span>${attach ? `<span class="attach">+ ${esc(attach)}</span>` : ''}`);
}
function toolChip(tool, args) {
  return li('tool', `<span class="t-call">→ <b>${esc(tool)}</b>(${esc(argText(args))})</span><span class="t-res">← <span class="spin">calling</span></span>`);
}
function settle(chip, v) {
  $('.t-res', chip).innerHTML = `← <span class="${v.tone}">${esc(v.res)}</span>`;
}
async function dots(ms) {
  const d = li('typing', '<i></i><i></i><i></i>');
  toBottom();
  await sleep(reduceMotion ? 0 : ms);
  d.remove();
}

const wiresById = new Map();
let aid = 0;
function answer(tool, x, wires, v) {
  const j = x.response.json, r = j?.result;
  const bad = x.response.status >= 400 || j?.error;
  const id = `a${++aid}`;
  wiresById.set(id, wires);
  const body = j?.error ? `<p><b>Error ${j.error.code}</b>: ${esc(j.error.message)}</p>` : md(r.content.map(c => c.text).join('\n\n'));
  const stampCls = v.tone === 'ok' ? 'good' : v.tone === 'mid' ? 'mid' : '';
  const el = li('ans', `<div class="card">
      <div class="card-h"><span>What your AI reads</span><code>← ${esc(tool)}</code></div>
      ${v.stamp && !bad ? `<span class="stamp-x ${stampCls}" aria-hidden="true">${esc(v.stamp)}</span>` : ''}
      <div class="card-b">${body}</div>
      <button type="button" class="more" hidden>Read all <span aria-hidden="true">↓</span></button>
      <div class="card-f">
        <span><b class="${bad ? 'err' : ''}">${x.response.status} ${STATUS[x.response.status] || ''}</b> · ${x.ms < 1 ? '<1' : Math.round(x.ms)} ms · ${esc(x.where)}</span>
        <button type="button" class="raw-t" aria-expanded="false" data-wire="${id}">&lt;/&gt; JSON-RPC</button>
      </div>
      <pre class="wire" hidden></pre>
    </div>`);
  const b = $('.card-b', el);
  if (b.scrollHeight > 380) { b.classList.add('clip'); $('.more', el).hidden = false; }
  const st = $('.stamp-x', el);
  if (st) setTimeout(() => { st.classList.add('show'); if (!reduceMotion) $('.card', el).classList.add('thunk'); }, reduceMotion ? 0 : 380);
  return el;
}
chat.addEventListener('click', e => {
  const more = e.target.closest('.more');
  if (more) { $('.card-b', more.parentElement).classList.remove('clip'); more.hidden = true; return; }
  const raw = e.target.closest('.raw-t');
  if (raw) {
    const pre = raw.closest('.card').querySelector('.wire');
    const open = raw.getAttribute('aria-expanded') !== 'true';
    if (open && !pre.innerHTML) pre.innerHTML = wireText(wiresById.get(raw.dataset.wire) || []);
    pre.hidden = !open;
    raw.setAttribute('aria-expanded', String(open));
  }
});

/* ---------- the demo: real tool results, replies stitched from them ---------- */
const SCRIPTS = [
  () => {
    const fit = callTool(data, 'fit_for', { job_description: JD.card }).structuredContent;
    const claim = callTool(data, 'prove_claim', { claim: '$2B+ a year in virtual card disbursements' }).structuredContent;
    const [a, b] = fit.matches;
    return [
      { you: 'Is Parth a fit for our Senior PM, Card Issuing role? Be honest about gaps.' },
      { tool: 'fit_for', args: { job_description: JD.card }, res: `${fit.band} · ${fit.score}/100 · ${fit.gaps.length} gaps`, tone: tone(fit.band) },
      { tool: 'prove_claim', args: { claim: claim.claim }, res: claim.verdict.replace(/_/g, ' '), tone: tone(claim.verdict) },
      { ai: `${fit.band} fit, ${fit.score}/100, ${fit.gaps.length ? `with ${fit.gaps.length} gap${fit.gaps.length > 1 ? 's' : ''} to ask about` : 'with no gaps against this description'}. ${esc(a.label)}: “${esc(clip(a.evidence[0].quote))}”<sup>1</sup> ${esc(b.label)}: “${esc(clip(b.evidence[0].quote, 110))}”<sup>2</sup>`,
        cite: `1 ${a.evidence[0].title} · 2 ${b.evidence[0].title}` },
    ];
  },
  () => {
    const c = callTool(data, 'prove_claim', { claim: 'managed a team of 20 PMs' }).structuredContent;
    return [
      { you: 'His LinkedIn friend says he managed a team of 20 PMs. True?' },
      { tool: 'prove_claim', args: { claim: c.claim }, res: c.verdict.replace(/_/g, ' '), tone: tone(c.verdict) },
      { ai: `No. ${esc(c.explanation.replace(/^Not supported\.\s*/, ''))}`, cite: 'the record keeps its gaps on purpose' },
    ];
  },
  () => {
    const s = callTool(data, 'search_evidence', { query: 'Kafka', limit: 3 }).structuredContent.results;
    const g = callTool(data, 'get_work', { id: s[0].id }).structuredContent;
    return [
      { you: 'Has he actually worked with Kafka, or is it a buzzword?' },
      { tool: 'search_evidence', args: { query: 'Kafka' }, res: `${s.length} quote${s.length === 1 ? '' : 's'}`, tone: 'ok' },
      { tool: 'get_work', args: { id: s[0].id }, res: g.metric ? `${g.metric.value} ${g.metric.label}` : g.title, tone: 'ok' },
      { ai: `Yes, as the product owner of the pipeline. “${esc(clip(s[0].quote, 190))}”<sup>1</sup>`, cite: `1 ${s[0].title}` },
    ];
  },
];
function demoStep(s) {
  if (s.you) return you(s.you);
  if (s.tool) { const c = toolChip(s.tool, s.args); settle(c, s); return c; }
  return li('ai', `<span class="ai-k">your assistant</span>${s.ai}<span class="cite">${esc(s.cite)}</span>`);
}

let demoOn = true, cleared = false, roomVisible = false;
new IntersectionObserver(([e]) => { roomVisible = e.isIntersecting; }, { threshold: 0.2 }).observe($('#try'));
async function whenVisible() { while (demoOn && (!roomVisible || document.hidden)) await sleep(300); }
function setRoom(state, where = '') {
  $('#roomLed').classList.toggle('off', state !== 'live');
  $('#roomState').textContent = state === 'demo' ? 'Demo · replaying' : state === 'paused' ? 'Demo paused · your turn'
    : `Your turn · ${where.startsWith('live') ? 'live server' : 'running in this page'}`;
}
async function playDemo() {
  setRoom('demo');
  if (reduceMotion) { SCRIPTS[0]().forEach(demoStep); return; }
  for (let i = 0; demoOn; i++) {
    const k = i % SCRIPTS.length;
    if (k === 0 && i) { await sleep(6000); if (!demoOn) return; chat.innerHTML = ''; }
    else if (k) li('sys', 'next question');
    for (const s of SCRIPTS[k]()) {
      await whenVisible();
      if (!demoOn) return;
      if (!s.you) { await dots(s.tool ? 650 : 1000); if (!demoOn) return; }
      demoStep(s);
      toBottom();
      await sleep(s.you ? 650 : 900);
    }
    await sleep(2400);
  }
}
function stopDemo() {
  if (!demoOn) return;
  demoOn = false;
  $$('.typing', chat).forEach(d => d.remove());
  setRoom('paused');
  $('.mx-point')?.classList.add('gone');
}
function takeOver() {
  stopDemo();
  if (cleared) return;
  cleared = true;
  chat.innerHTML = '';
  li('sys', 'your turn · same code as the server');
  setRoom('live');
}

/* ---------- asking ---------- */
let busy = false;
async function ask({ text, tool, args, attach }) {
  if (busy) return;
  busy = true;
  $('#go').disabled = true;
  takeOver();
  try {
    const r = tool ? { tool, args } : route(text);
    const long = !tool && r.tool === 'fit_for' && text.length > 160;
    const qEl = you(long ? clip(text.replace(/\s+/g, ' '), 140) : text, attach || (long ? `job post, ${text.length.toLocaleString()} characters` : ''));
    toBottom();
    let chip = toolChip(r.tool, r.args);
    toBottom();
    let { x, wires } = await call(r.tool, r.args);
    if (!reduceMotion) await sleep(320);
    let v = verdictOf(r.tool, x.response.json?.result);
    settle(chip, v);
    let used = r.tool;
    // nothing by that name: look for the words instead, the way an assistant would
    if (r.fallback && x.response.json?.result?.isError) {
      chip = toolChip('search_evidence', { query: r.fallback });
      toBottom();
      ({ x, wires } = await call('search_evidence', { query: r.fallback }));
      if (!reduceMotion) await sleep(260);
      v = verdictOf('search_evidence', x.response.json?.result);
      settle(chip, v);
      used = 'search_evidence';
    }
    answer(used, x, wires, v);
    setRoom('live', x.where);
    chat.scrollTo({ top: qEl.offsetTop - chat.offsetTop - 14, behavior: reduceMotion ? 'auto' : 'smooth' });
  } finally {
    busy = false;
    $('#go').disabled = false;
  }
}

/* suggestions: four at a time, the used ones make room for new ones */
const SUGG = [
  { label: 'Did he manage a team of 20 PMs?', tool: 'prove_claim', args: { claim: 'managed a team of 20 PMs' } },
  { label: 'Is he a fit for an AI platform PM?', text: 'Is he a fit for this AI platform PM role?', attach: 'job post: AI Platform PM', tool: 'fit_for', args: { job_description: JD.ai } },
  { label: 'Has he worked with Kafka?', tool: 'search_evidence', args: { query: 'Kafka' } },
  { label: 'Tell me about the Sparrow launch', tool: 'get_work', args: { id: 'sparrow-launch' } },
  { label: '$3B a year in disbursements?', tool: 'prove_claim', args: { claim: '$3B a year in disbursements' } },
  { label: 'Fit for a growth director?', text: 'Would he fit our Director of Product, Consumer Growth role?', attach: 'job post: Growth director', tool: 'fit_for', args: { job_description: JD.growth } },
  { label: 'Has he done idempotency?', tool: 'search_evidence', args: { query: 'idempotency' } },
  { label: 'Who is he, right now?', tool: 'get_profile', args: {} },
  { label: 'How do I reach him?', tool: 'contact', args: {} },
];
const usedSugg = new Set();
function renderSugg() {
  let open = SUGG.filter(s => !usedSugg.has(s.label));
  if (open.length < 4) { usedSugg.clear(); open = SUGG; }
  $('#sugg').innerHTML = open.slice(0, 4).map(s => `<button type="button" class="chip" data-sugg="${esc(s.label)}">${esc(s.label)}</button>`).join('');
  $('#sugg').scrollLeft = 0;
}
$('#sugg').addEventListener('click', e => {
  const b = e.target.closest('[data-sugg]');
  if (!b || busy) return;
  const s = SUGG.find(x => x.label === b.dataset.sugg);
  usedSugg.add(s.label);
  renderSugg();
  ask({ text: s.text || s.label, tool: s.tool, args: s.args, attach: s.attach });
});
renderSugg();

const q = $('#q');
const grow = () => { q.style.height = 'auto'; q.style.height = `${Math.min(q.scrollHeight, 160)}px`; };
q.addEventListener('input', grow);
q.addEventListener('focus', stopDemo);
q.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#askForm').requestSubmit(); }
});
$('#askForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = q.value.trim();
  if (!text) { q.focus(); return; }
  if (busy) return;
  q.value = '';
  grow();
  ask({ text });
});
$('#goAsk').addEventListener('click', e => {
  e.preventDefault();
  $('#try').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  q.focus({ preventScroll: true });
});

for (const b of $$('.room-proto button')) b.addEventListener('click', () => {
  proto = b.dataset.proto;
  legacyReady = false;
  for (const x of $$('.room-proto button')) x.setAttribute('aria-checked', String(x === b));
  toast(proto === '2026-07-28' ? 'Spec 2026: stateless, no handshake' : 'Spec 2025: the next ask shakes hands first');
});

playDemo();

/* ---------- plug it in ---------- */
const EP = MCP_ENDPOINT || 'https://<endpoint going live soon>/mcp';
if (LIVE) {
  $('#epLed').classList.remove('off');
  $('#epState').textContent = 'Live';
  $('#epUrl').textContent = MCP_ENDPOINT;
  $('#epCopy').disabled = false;
} else {
  $('#epNote').textContent = 'going live soon. "Any AI" in step 2 works today.';
}
$('#epCopy').addEventListener('click', () => copy(MCP_ENDPOINT, 'URL copied'));

const ANY_PROMPT = `I'm considering Parth Aggarwal for a role. Read his career record:
${SITE}data/career.json
(a short summary for AI readers: ${SITE}llms.txt)

Answer only from that record. Quote the line behind every claim, link to it on his portfolio, and say plainly when something isn't covered - the record lists his gaps on purpose.

The role:
[paste the job description]`;
const APPS = [
  { id: 'claude', label: 'Claude', path: ['Settings', 'Connectors', 'Add custom connector'], line: 'Name it <b>Parth Aggarwal</b> and paste the URL. On Team or Enterprise, an owner adds it under <b>Admin settings → Connectors</b>.' },
  { id: 'chatgpt', label: 'ChatGPT', path: ['Settings', 'Apps & Connectors', 'Advanced', 'Developer mode', 'Create'], line: 'Paste the URL and pick <b>No authentication</b>. Depends on your plan.' },
  { id: 'cursor', label: 'Cursor', line: 'Add this to <code>~/.cursor/mcp.json</code>, or <b>Cursor Settings → MCP</b>.', code: JSON.stringify({ mcpServers: { parth: { url: EP } } }, null, 2) },
  { id: 'code', label: 'Claude Code', line: 'Run it once, then ask in plain words. <code>/mcp</code> shows it connected.', code: `claude mcp add --transport http parth ${EP}` },
  { id: 'any', label: 'Any AI', line: 'No connector? Paste this into any AI that can open links, with the job post at the end.', code: ANY_PROMPT },
];
const apps = $('#apps'), appStep = $('#appStep');
apps.innerHTML = APPS.map(a => `<button type="button" class="chip" role="tab" aria-selected="false" data-app="${a.id}">${esc(a.label)}</button>`).join('');
function showApp(id) {
  const a = APPS.find(x => x.id === id);
  for (const b of $$('[data-app]', apps)) b.setAttribute('aria-selected', String(b.dataset.app === id));
  appStep.innerHTML = `${a.path ? `<ol class="path">${a.path.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
    <p>${a.line}</p>
    ${a.code ? `<div class="snip"><pre>${esc(a.code)}</pre><button type="button" class="btn sm ink" data-copy>Copy</button></div>` : ''}
    ${a.id !== 'any' && !LIVE ? '<p class="note">endpoint going live soon: "Any AI" works today</p>' : ''}`;
  if (!reduceMotion) { appStep.classList.remove('pop'); void appStep.offsetWidth; appStep.classList.add('pop'); }
}
apps.addEventListener('click', e => { const b = e.target.closest('[data-app]'); if (b) showApp(b.dataset.app); });
apps.addEventListener('keydown', e => {
  if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const bs = $$('[data-app]', apps), i = bs.indexOf(document.activeElement);
  if (i < 0) return;
  const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
  n.focus();
  showApp(n.dataset.app);
});
appStep.addEventListener('click', e => { if (e.target.closest('[data-copy]')) copy($('pre', appStep).textContent); });
showApp(LIVE ? 'claude' : 'any');

const PROMPTS_TO_TRY = [
  'Is Parth a fit for this role? Be honest about the gaps. [paste the job post]',
  'What is the strongest evidence he can run an API platform for enterprise clients?',
  'Check this claim against his record: he cut bank onboarding from 4 months to 1.',
  'Interview him for a senior PM role in payments. Three questions, with what his record says.',
];
$('#prompts').innerHTML = PROMPTS_TO_TRY.map((p, i) => `<li><button type="button" data-prompt="${i}"><span>${esc(p)}</span><i aria-hidden="true">copy</i></button></li>`).join('');
$('#prompts').addEventListener('click', e => { const b = e.target.closest('[data-prompt]'); if (b) copy(PROMPTS_TO_TRY[+b.dataset.prompt], 'Prompt copied'); });

/* ---------- what's in the box: the seven tools, as cartridges ---------- */
const CARTS = {
  get_profile: { line: 'Who he is right now: role, location, what he is open to.', try: { label: 'Who is he, right now?' } },
  list_work: { line: 'Every case, role and project, one line each.', try: { label: 'What has he built?' } },
  get_work: { line: 'One case in full: what he did, the numbers, the stack.', try: { label: 'Tell me about Connector Studio', args: { id: 'connector-studio' } } },
  search_evidence: { line: 'Every line of the record that mentions a topic.', try: { label: 'Has he done idempotency?', args: { query: 'idempotency' } } },
  prove_claim: { line: 'True, partly, or not on record, with the quote.', try: { label: '150K+ cards issued?', args: { claim: '150K+ cards issued' } } },
  fit_for: { line: 'Scores a job post, line by line, gaps included.', try: { label: 'Is he a fit for this card-issuing PM role?', attach: 'job post: Card-issuing PM', args: { job_description: JD.card } } },
  contact: { line: 'How to reach him and what he is open to.', try: { label: 'How do I reach him?' } },
};
$('#carts').innerHTML = TOOLS.map((t, i) => {
  const c = CARTS[t.name] || { line: t.description, try: { label: t.title } };
  return `<button type="button" class="cart" data-tool="${t.name}" style="--i:${i}">
    <span class="cart-grip" aria-hidden="true"></span>
    <span class="cart-n">${String(i + 1).padStart(2, '0')}</span>
    <code class="cart-t">${esc(t.name)}</code>
    <span class="cart-l">${esc(c.line)}</span>
    <span class="cart-go">▶ try “${esc(clip(c.try.label, 34))}”</span>
  </button>`;
}).join('');
$('#carts').addEventListener('click', e => {
  const b = e.target.closest('.cart');
  if (!b || busy) return;
  const t = b.dataset.tool, c = CARTS[t];
  $('#try').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  ask({ text: c.try.label, tool: t, args: c.try.args || {}, attach: c.try.attach });
});

console.info(`parth-aggarwal MCP: ${TOOLS.length} tools, ${RESOURCES.length} resources, ${PROMPTS.length} prompts, running ${LIVE ? `against ${MCP_ENDPOINT}` : 'in this page'}`);
