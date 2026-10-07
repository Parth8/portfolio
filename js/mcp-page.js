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
  $('#ansBody').textContent = 'The career record did not load, so the console cannot run. Reload, or read data/career.json directly.';
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
  $('#plug').classList.add('live');
  $('#epState').textContent = 'Live';
  $('#epUrl').textContent = MCP_ENDPOINT;
  $('#epCopy').hidden = false;
  $('#epCopy').addEventListener('click', () => copy(MCP_ENDPOINT, 'URL copied'));
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

/* ---------- connect: one URL, one client at a time ---------- */
const EP = MCP_ENDPOINT || 'https://<endpoint going live soon>/mcp';
const ANY_PROMPT = `I'm considering Parth Aggarwal for a role. Read his career record:
${SITE}data/career.json
(a short summary for AI readers: ${SITE}llms.txt)

Answer only from that record. Quote the line behind every claim, link to it on his portfolio, and say plainly when something isn't covered - the record lists his gaps on purpose.

The role:
[paste the job description]`;
const CLIENTS = [
  { id: 'claude', label: 'Claude', step: 'In Claude, open <b>Settings → Connectors → Add custom connector</b>, name it <b>Parth Aggarwal</b> and paste the URL. (Team or Enterprise: an owner adds it under <b>Admin settings → Connectors</b>.)', code: EP },
  { id: 'chatgpt', label: 'ChatGPT', step: 'In <b>Settings → Apps &amp; Connectors → Advanced settings</b>, turn on Developer mode, then <b>Create</b>: paste the URL and pick <b>No authentication</b>. Plan-dependent.', code: EP },
  { id: 'cursor', label: 'Cursor', step: 'Add this to <code>~/.cursor/mcp.json</code> (or <b>Cursor Settings → MCP</b>) and ask in the agent chat.', code: JSON.stringify({ mcpServers: { parth: { url: EP } } }, null, 2) },
  { id: 'code', label: 'Claude Code', step: 'Run this once, then ask in plain words. <code>/mcp</code> shows it connected.', code: `claude mcp add --transport http parth ${EP}` },
  { id: 'any', label: 'Any AI', small: 'no setup', step: 'No connector? Paste this into any assistant that can open links, with the job description at the end.', code: ANY_PROMPT },
];
const plugTabs = $('#plugTabs'), plugStep = $('#plugStep');
plugTabs.innerHTML = CLIENTS.map(c => `<button type="button" role="tab" aria-selected="false" data-client="${c.id}">${esc(c.label)}${c.small ? `<small>${esc(c.small)}</small>` : ''}</button>`).join('');
function showClient(id) {
  const c = CLIENTS.find(x => x.id === id);
  for (const b of $$('button', plugTabs)) b.setAttribute('aria-selected', String(b.dataset.client === id));
  plugStep.innerHTML = `<p>${c.step}</p><div class="snip"><pre>${esc(c.code)}</pre><button type="button" class="cp-btn" data-copy>Copy</button></div>
    ${c.id !== 'any' && !LIVE ? '<p class="plug-note">endpoint going live soon: until then, "Any AI" works today</p>' : ''}`;
  plugStep.style.animation = 'none'; void plugStep.offsetWidth; plugStep.style.animation = '';
}
plugTabs.addEventListener('click', e => { const b = e.target.closest('[data-client]'); if (b) showClient(b.dataset.client); });
plugStep.addEventListener('click', e => { if (e.target.closest('[data-copy]')) copy($('pre', plugStep).textContent); });
showClient(LIVE ? 'claude' : 'any');

/* ---------- try it: four questions, one answer ---------- */
const JD = {
  card: 'Senior Product Manager, Card Issuing. Own our card issuing platform: virtual and physical cards, processor integrations and the APIs our enterprise clients build on. Work with compliance and risk to launch card programs in the US and Europe. 5+ years in fintech or payments; card networks (Visa, Mastercard), chargebacks and disputes, fraud controls, KYC and PCI DSS; webhooks; go-to-market with sales; SQL and dashboards.',
  ai: 'Product Manager, AI Platform (Forward Deployed). Own the platform that lets enterprise customers build agents on our APIs: tools over MCP, retrieval (RAG) and evaluation pipelines, and the call between open-weight and hosted models on cost, latency and accuracy. 4+ years on developer or platform products; hands-on with LLMs, prompt engineering, evals and guardrails; technical enough to prototype; regulated industries a plus.',
  growth: 'Director of Product, Consumer Growth. Lead and manage a team of 6 product managers across activation, retention and monetisation for our consumer app on iOS and Android. Own experimentation: A/B testing, funnels, growth loops. 10+ years of product experience, including 4+ years managing product managers.',
};
const ASKS = [
  { tool: 'prove_claim', n: 'A', title: 'Is this true?', field: 'claim', label: 'The claim, in plain words', def: 'managed a team of 20 PMs',
    presets: ['managed a team of 20 PMs', '150K+ cards issued', '$3B a year in disbursements', 'built an MCP in 6 weeks'] },
  { tool: 'fit_for', n: 'B', title: 'Is he a fit?', field: 'job_description', label: 'The job description', def: JD.ai, long: true,
    presets: [['AI platform PM', JD.ai], ['Card-issuing PM', JD.card], ['Growth director', JD.growth]] },
  { tool: 'search_evidence', n: 'C', title: 'Has he done…?', field: 'query', label: 'Words to look for', def: 'Kafka',
    presets: ['Kafka', 'idempotency', 'golden dataset', 'passkeys'] },
  { tool: 'get_work', n: 'D', title: 'Tell me about…', field: 'id', label: 'A case, role or project', def: 'sparrow-launch',
    presets: ['sparrow-launch', 'connector-studio', 'Optum', 'shelfie'] },
];
const values = Object.fromEntries(ASKS.map(a => [a.tool, a.def]));
let ask = ASKS[0];
const asksEl = $('#asks'), form = $('#askForm');
asksEl.innerHTML = ASKS.map(a => `<button type="button" class="ask" role="tab" aria-selected="false" data-tool="${a.tool}">
  <span class="ask-n">${a.n}</span><span class="ask-t">${esc(a.title)}</span><span class="ask-l">${a.tool}</span></button>`).join('');
function pick(tool) {
  if ($('#q')) values[ask.tool] = $('#q').value;
  ask = ASKS.find(a => a.tool === tool);
  for (const b of $$('.ask', asksEl)) b.setAttribute('aria-selected', String(b.dataset.tool === tool));
  form.innerHTML = `<label for="q">${esc(ask.label)}</label>
    ${ask.long ? `<textarea id="q" spellcheck="false">${esc(values[tool])}</textarea>` : `<input id="q" value="${esc(values[tool])}">`}
    <div class="ask-row">
      <div class="presets"><span>try</span>${ask.presets.map((x, i) => `<button type="button" data-preset="${i}">${esc(Array.isArray(x) ? x[0] : x)}</button>`).join('')}</div>
      <button class="ask-go" type="submit">Ask <code>${ask.tool}</code> <span aria-hidden="true">↵</span></button>
    </div>`;
}
asksEl.addEventListener('click', e => { const b = e.target.closest('.ask'); if (b) pick(b.dataset.tool); });
form.addEventListener('click', e => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const x = ask.presets[+b.dataset.preset];
  $('#q').value = Array.isArray(x) ? x[1] : x;
  send();
});
form.addEventListener('submit', e => { e.preventDefault(); send(); });
form.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
pick('prove_claim');

/* transport: the live Worker when configured, otherwise the same handler in this page */
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
  if (LIVE && liveOutdated) where = `in this page (the live server runs older build ${liveOutdated})`;
  if (!res) res = handleMcp(data, { method: 'POST', headers, body });
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { /* not JSON */ }
  return { request: { headers, msg }, response: { status: res.status, headers: res.headers, json }, ms: performance.now() - t0, where };
}

const wires = [];
async function send() {
  const v = $('#q').value.trim();
  if (!v) { $('#q').focus(); return; }
  values[ask.tool] = v;
  const go = $('.ask-go', form);
  go.disabled = true;
  try {
    wires.length = 0;
    if (proto !== '2026-07-28' && !legacyReady) {
      wires.push(await exchange('initialize', { protocolVersion: proto, capabilities: {}, clientInfo: CLIENT }));
      wires.push(await exchange('notifications/initialized', null, { notify: true }));
      legacyReady = true;
    }
    const x = await exchange('tools/call', { name: ask.tool, arguments: { [ask.field]: v } });
    wires.push(x);
    show(x);
  } finally { go.disabled = false; }
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
function show(x) {
  const j = x.response.json, r = j?.result;
  const bad = x.response.status >= 400 || j?.error || r?.isError;
  $('#ansStatus').innerHTML = `<b class="${bad ? 'err' : ''}">${x.response.status} ${STATUS[x.response.status] || ''}</b> · ${x.ms < 1 ? '<1' : Math.round(x.ms)} ms · ${esc(x.where)}`;
  const body = $('#ansBody');
  body.innerHTML = j?.error ? `<p><b>Error ${j.error.code}</b>: ${esc(j.error.message)}</p>` : md(r.content.map(c => c.text).join('\n\n'));
  body.scrollTop = 0;
  if (!reduceMotion) { body.classList.remove('flash'); void body.offsetWidth; body.classList.add('flash'); }
  // a rubber stamp for the two tools with a verdict
  const sc = r?.structuredContent, st = $('#ansStamp');
  st.className = 'ans-stamp';
  if (sc && ask.tool === 'prove_claim') stamp(sc.verdict.replace(/_/g, ' '), `v-${sc.verdict}`);
  else if (sc && ask.tool === 'fit_for' && sc.score != null) stamp(`${sc.band} · ${sc.score}`, `v-${sc.band.toLowerCase()}`);
  renderWire();
}
function stamp(text, cls) {
  const st = $('#ansStamp');
  st.textContent = text;
  st.classList.add(cls);
  requestAnimationFrame(() => requestAnimationFrame(() => st.classList.add('show')));
}

const hl = s => esc(s).replace(/(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?\b/g,
  (m, str, colon, kw) => (str ? (colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`) : kw ? `<span class="j-b">${m}</span>` : `<span class="j-n">${m}</span>`));
const cut = (s, n = 6000) => (s.length > n ? `${s.slice(0, n)}\n… ${(s.length - n).toLocaleString()} more characters` : s);
function renderWire() {
  $('#wire').innerHTML = wires.map(x => {
    const reqH = Object.entries(x.request.headers).map(([k, v]) => `<span class="w-h">${esc(k)}:</span> ${esc(v)}`).join('\n');
    const resH = Object.entries(x.response.headers || {}).map(([k, v]) => `<span class="w-h">${esc(k)}:</span> ${esc(v)}`).join('\n');
    const st = x.response.status;
    return `<span class="w-l">POST /mcp HTTP/1.1</span>\n${reqH}\n\n${hl(JSON.stringify(x.request.msg, null, 2))}\n\n<span class="${st >= 400 ? 'w-e' : 'w-l'}">HTTP/1.1 ${st} ${STATUS[st] || ''}</span>\n${resH}${x.response.json ? `\n\n${hl(cut(JSON.stringify(x.response.json, null, 2)))}` : ''}`;
  }).join('\n\n<span class="w-h">──────────</span>\n\n') || 'Ask something first.';
}
for (const b of $$('.proto button')) b.addEventListener('click', () => {
  proto = b.dataset.proto;
  legacyReady = false;
  for (const x of $$('.proto button')) x.setAttribute('aria-checked', String(x === b));
  toast(proto === '2026-07-28' ? 'Stateless: no handshake' : 'Classic: the next ask does initialize first');
});
console.info(`parth-aggarwal MCP: ${TOOLS.length} tools, ${RESOURCES.length} resources, ${PROMPTS.length} prompts, running ${LIVE ? `against ${MCP_ENDPOINT}` : 'in this page'}`);
