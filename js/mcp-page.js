// Ask AI: connect in one step, watch one example, try one tool.
// The console runs the server's own code (mcp-core.js) in the page, or the live Worker once js/config.js names it.

import { handleMcp, callTool, TOOLS, SERVER_INFO } from './mcp-core.js';
import { MCP_ENDPOINT } from './config.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = !!MCP_ENDPOINT;
const SITE = 'https://parth8.github.io/portfolio/';

addEventListener('scroll', () => $('#bar').classList.toggle('scrolled', scrollY > 8), { passive: true });
const revealer = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }));
$$('[data-reveal]').forEach(el => revealer.observe(el));

let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  $('#outBody').textContent = 'The career record did not load, so the console cannot run.';
  throw new Error('career.json failed to load');
}

let toastT;
function toast(msg) {
  $('.toast')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${esc(msg)}</div>`);
  clearTimeout(toastT);
  toastT = setTimeout(() => $('.toast')?.remove(), 2200);
}
async function copy(text, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(what); } catch { prompt('Copy this:', text); }
}

/* ---------- connect: one URL, one client at a time ---------- */
const EP = MCP_ENDPOINT || 'https://<endpoint going live soon>/mcp';
if (LIVE) {
  $('#ep').classList.add('live');
  $('#epState').textContent = 'Live';
  $('#epUrl').textContent = MCP_ENDPOINT;
  $('#epCopy').hidden = false;
  $('#epCopy').addEventListener('click', () => copy(MCP_ENDPOINT, 'URL copied'));
}
const ANY_PROMPT = `I'm considering Parth Aggarwal for a role. Read his career record:
${SITE}data/career.json
(summary for AI readers: ${SITE}llms.txt)

Answer only from that record. Cite the portfolio link for every claim, keep each claim's proof tier (verified, corroborated or self-reported), and say plainly when something isn't covered.

The role:
[paste the job description]`;
const CLIENTS = [
  { id: 'any', label: 'Any AI, no setup', live: false,
    steps: ['Copy this prompt into ChatGPT, Claude, Gemini or any assistant that can open links.', 'Paste the job description where it says so.'], code: ANY_PROMPT },
  { id: 'claude', label: 'Claude', live: true,
    steps: ['<b>Settings → Connectors → Add custom connector</b>. On Team or Enterprise, an owner adds it in <b>Admin settings → Connectors</b>.', 'Name it <b>Parth Aggarwal</b>, paste the URL, then turn it on in a chat.'], code: EP },
  { id: 'code', label: 'Claude Code', live: true,
    steps: ['Run this once, then ask in plain words. <code>/mcp</code> shows it connected.'], code: `claude mcp add --transport http parth ${EP}` },
  { id: 'cursor', label: 'Cursor', live: true,
    steps: ['Add this to <code>~/.cursor/mcp.json</code> (or <b>Settings → MCP</b>), then ask in the agent chat.'], code: JSON.stringify({ mcpServers: { parth: { url: EP } } }, null, 2) },
  { id: 'chatgpt', label: 'ChatGPT', live: true,
    steps: ['<b>Settings → Apps & Connectors → Advanced settings</b>: turn on Developer mode (plan-dependent).', '<b>Create</b>, paste the URL, choose <b>No authentication</b>.'], code: EP },
];
const clientsEl = $('#clients'), stepsEl = $('#clientSteps');
clientsEl.innerHTML = CLIENTS.map((c, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-client="${c.id}">${esc(c.label)}</button>`).join('');
function showClient(id) {
  const c = CLIENTS.find(x => x.id === id);
  for (const b of $$('button', clientsEl)) b.setAttribute('aria-selected', String(b.dataset.client === id));
  stepsEl.innerHTML = `<ol>${c.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <div class="snip"><pre>${esc(c.code)}</pre><button type="button" data-copy>Copy</button></div>
    ${c.live && !LIVE ? '<p class="pending">The public endpoint goes live soon. Until then, "Any AI" works today, and the console below runs the same server code.</p>' : ''}`;
  stepsEl.style.animation = 'none'; void stepsEl.offsetWidth; stepsEl.style.animation = '';
}
clientsEl.addEventListener('click', e => { const b = e.target.closest('[data-client]'); if (b) showClient(b.dataset.client); });
stepsEl.addEventListener('click', e => { if (e.target.closest('[data-copy]')) copy($('pre', stepsEl).textContent); });
showClient(LIVE ? 'claude' : 'any');

/* ---------- the demo: real tool results, replies stitched from them ---------- */
const clip = (s, n = 140) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
const TIER = { verified: 'verified', corroborated: 'corroborated', self: 'self-reported' };
const SCRIPTS = [
  () => {
    const jd = 'Senior Product Manager, Card Issuing. Own our card issuing platform and APIs for enterprise clients: card programs, Visa and Mastercard, fraud and disputes, PCI and KYC compliance, go-to-market. 5+ years in fintech or payments.';
    const fit = callTool(data, 'fit_for', { job_description: jd }).structuredContent;
    const c = callTool(data, 'prove_claim', { claim: '150K+ cards issued' }).structuredContent;
    const top = fit.matches[0];
    return [
      { you: 'Is Parth a fit for our Senior PM, Card Issuing role? How sure are you?' },
      { tool: 'fit_for', args: 'job_description: "Senior PM, Card Issuing…"', res: `${fit.band} · ${fit.score}/100 · range ${fit.range.low}–${fit.range.high}`, ok: true },
      { tool: 'prove_claim', args: 'claim: "150K+ cards issued"', res: `${c.verdict} · ${TIER[c.proof]}`, ok: c.verdict === 'supported' },
      { ai: `${esc(fit.band)}, ${fit.score}/100. It could be ${fit.range.low} or ${fit.range.high} depending on what his references say. His strongest match is ${esc(top.label.toLowerCase())}, at confidence ${top.confidence}: “${esc(clip(top.evidence[0].quote))}”<sup>1</sup> The 150K+ cards figure comes from his resume. Zeta's own newsroom confirms the program itself.<sup>2</sup>`,
        cite: `1 ${top.evidence[0].title} · 2 ${(c.sources || []).find(s => s.kind === 'press')?.publisher || 'public source'}` },
    ];
  },
  () => {
    const c = callTool(data, 'prove_claim', { claim: 'managed a team of 20 PMs' }).structuredContent;
    return [
      { you: 'Someone told me he managed a team of 20 PMs. True?' },
      { tool: 'prove_claim', args: 'claim: "managed a team of 20 PMs"', res: c.verdict, ok: false },
      { ai: `No. ${esc(c.explanation.replace(/^Not supported\.\s*/, ''))}`, cite: 'the record keeps its gaps on purpose' },
    ];
  },
  () => {
    const s = callTool(data, 'search_evidence', { query: 'Kafka', limit: 3 }).structuredContent.results;
    return [
      { you: 'Has he actually worked with Kafka, or is it a buzzword?' },
      { tool: 'search_evidence', args: 'query: "Kafka"', res: `${s.length} quote${s.length === 1 ? '' : 's'} · ${TIER[s[0].proof]}`, ok: true },
      { ai: `Yes, as the product owner of the data platform, not as an engineer: “${esc(clip(s[0].quote, 170))}”<sup>1</sup> That's from his resume, so ask for a reference on it.`, cite: `1 ${s[0].title} · ${TIER[s[0].proof]}` },
    ];
  },
];
const log = $('#demoLog');
let demoVisible = false;
new IntersectionObserver(([e]) => { demoVisible = e.isIntersecting; }, { threshold: 0.25 }).observe($('.demo'));
const whenVisible = async () => { while (!demoVisible || document.hidden) await sleep(300); };
function stepEl(s) {
  const li = document.createElement('li');
  if (s.you) { li.className = 'dm dm-you'; li.textContent = s.you; }
  else if (s.tool) { li.className = 'dm dm-tool'; li.innerHTML = `→ <b>${esc(s.tool)}</b>(${esc(s.args)})<span class="res">← <span class="${s.ok ? 'ok' : 'no'}">${esc(s.res)}</span></span>`; }
  else { li.className = 'dm dm-ai'; li.innerHTML = `${s.ai}<span class="cite">${esc(s.cite)}</span>`; }
  return li;
}
(async () => {
  if (reduce) { SCRIPTS[0]().forEach(s => log.append(stepEl(s))); return; }
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
        await sleep(s.tool ? 650 : 1000);
        dots.remove();
      }
      log.append(stepEl(s));
      await sleep(s.you ? 550 : 850);
    }
    await sleep(7000);
  }
})();

/* ---------- try a tool ---------- */
const JD = 'Product Manager, AI Platform (Forward Deployed). Own the platform enterprise customers use to build agents on our APIs: tools over MCP, retrieval (RAG) and evaluation pipelines, and the call between open-weight and hosted models on cost and accuracy. Hands-on with LLMs and evals; technical enough to prototype; regulated industries a plus.';
const PICK = {
  prove_claim: { label: 'Check a claim', field: 'claim', title: 'The claim, in plain words', def: 'managed a team of 20 PMs', presets: ['managed a team of 20 PMs', '150K+ cards issued', '$3B a year in disbursements', 'built an MCP in 6 weeks'] },
  fit_for: { label: 'Score a role', field: 'job_description', title: 'The job description', def: JD, long: true, presets: [['AI platform PM', JD], ['Card-issuing PM', 'Senior Product Manager, Card Issuing. Card programs, Mastercard, disputes, fraud, PCI, KYC, APIs and webhooks for enterprise banks. 5+ years.'], ['Growth director', 'Director of Product, Consumer Growth. Manage a team of 6 product managers. Own A/B testing, retention, iOS and Android. 10+ years, 4+ managing PMs.']] },
  search_evidence: { label: 'Search the record', field: 'query', title: 'Words to look for', def: 'Kafka', presets: ['Kafka', 'idempotency', 'golden dataset', 'passkeys'] },
  get_work: { label: 'Open one item', field: 'id', title: 'An id or a name', def: 'sparrow-launch', presets: ['sparrow-launch', 'connector-studio', 'shelfie', 'Optum'] },
};
const values = Object.fromEntries(Object.entries(PICK).map(([k, v]) => [k, v.def]));
let tool = 'prove_claim';
const toolsEl = $('#tools'), form = $('#toolForm');
toolsEl.innerHTML = Object.entries(PICK).map(([name, p]) => `<button type="button" role="tab" aria-selected="${name === tool}" data-tool="${name}"><code>${name}</code><span>${esc(p.label)}</span></button>`).join('');
function renderForm() {
  const p = PICK[tool];
  for (const b of $$('button', toolsEl)) b.setAttribute('aria-selected', String(b.dataset.tool === tool));
  const input = p.long
    ? `<textarea id="tf" spellcheck="false">${esc(values[tool])}</textarea>`
    : `<input id="tf" value="${esc(values[tool])}">`;
  form.innerHTML = `<label for="tf">${esc(p.title)}</label>${input}
    <div class="tf-row">
      <div class="presets"><span class="muted">Try</span>${p.presets.map((x, i) => `<button type="button" data-preset="${i}">${esc(Array.isArray(x) ? x[0] : x)}</button>`).join('')}</div>
      <button class="btn primary" type="submit">Send <span class="arr" aria-hidden="true">→</span></button>
    </div>`;
}
toolsEl.addEventListener('click', e => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  values[tool] = $('#tf').value;
  tool = b.dataset.tool;
  renderForm();
});
form.addEventListener('click', e => {
  const b = e.target.closest('[data-preset]');
  if (!b) return;
  const x = PICK[tool].presets[+b.dataset.preset];
  $('#tf').value = Array.isArray(x) ? x[1] : x;
  send();
});
form.addEventListener('submit', e => { e.preventDefault(); send(); });
form.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
renderForm();

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
      // a server deployed from an older build would contradict the rest of the site: use the current code instead
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
  const v = $('#tf').value.trim();
  if (!v) { $('#tf').focus(); return; }
  values[tool] = v;
  const go = $('button[type="submit"]', form);
  go.disabled = true;
  try {
    wires.length = 0;
    if (proto !== '2026-07-28' && !legacyReady) {
      wires.push(await exchange('initialize', { protocolVersion: proto, capabilities: {}, clientInfo: CLIENT }));
      wires.push(await exchange('notifications/initialized', null, { notify: true }));
      legacyReady = true;
    }
    const x = await exchange('tools/call', { name: tool, arguments: { [PICK[tool].field]: v } });
    wires.push(x);
    show(x);
  } finally { go.disabled = false; }
}

// the text an AI reads, lightly formatted for people: **bold**, [links](url), "- " lists
function md(text) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/`([^`]+)`/g, '<code>$1</code>');
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
  $('#outStatus').innerHTML = `<b class="${bad ? 'err' : ''}">${x.response.status} ${STATUS[x.response.status] || ''}</b> · ${x.ms < 1 ? '<1' : Math.round(x.ms)} ms · ${esc(x.where)}`;
  const sc = r?.structuredContent;
  let verdict = '';
  if (tool === 'prove_claim' && sc) {
    const cls = sc.verdict === 'supported' ? '' : sc.verdict === 'partial' || sc.verdict === 'differs' ? 'mid' : 'no';
    verdict = `<span class="pill ${cls}">${esc(sc.verdict.replace('_', ' '))}</span>${sc.proof ? `<span class="proof" data-tier="${sc.proof}">${{ verified: 'Verified', corroborated: 'Corroborated', self: 'Self-reported' }[sc.proof]}</span>` : ''}`;
  } else if (tool === 'fit_for' && sc?.score != null) {
    verdict = `<span class="pill ${sc.score >= 65 ? '' : sc.score >= 45 ? 'mid' : 'no'}">${sc.score}/100 · ${esc(sc.band)}</span>`;
  }
  $('#outVerdict').innerHTML = verdict;
  const body = $('#outBody');
  body.innerHTML = j?.error ? `<p><b>Error ${j.error.code}</b>: ${esc(j.error.message)}</p>` : md(r.content.map(c => c.text).join('\n\n'));
  body.style.animation = 'none'; void body.offsetWidth; body.style.animation = '';
  renderWire();
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
  }).join('\n\n<span class="w-h">──────────</span>\n\n') || 'Send something first.';
}
for (const b of $$('.proto button')) b.addEventListener('click', () => {
  proto = b.dataset.proto;
  legacyReady = false;
  for (const x of $$('.proto button')) x.setAttribute('aria-checked', String(x === b));
  toast(proto === '2026-07-28' ? 'Stateless: no handshake' : 'Classic: the next send does initialize first');
});
console.info(`parth-aggarwal MCP: ${TOOLS.length} tools, running ${LIVE ? `against ${MCP_ENDPOINT}` : 'in this page'}`);
