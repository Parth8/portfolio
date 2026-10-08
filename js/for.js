// "For you": a fit machine. Pick who's asking or paste the job; the scoreboard stays beside you while
// the details sit behind tabs. Scores come from js/career-engine.js and only ever quote Parth's own record.

import { fitFor, fitFromIds, getProfile, PERSONAS } from './career-engine.js';
import { initCursor } from './cursor.js';

const SAMPLES = {
  card: `Senior Product Manager, Card Issuing
We're hiring a Senior PM to own our card issuing platform: virtual and physical cards, BIN sponsorship, processor integrations and the APIs our enterprise clients build on. You will work with engineering, compliance and risk to launch new card programs in the US and Europe.
Requirements: 5+ years of product management in fintech or payments. Deep knowledge of card networks (Visa, Mastercard), authorisations, chargebacks and disputes. Experience with fraud controls, KYC and PCI DSS. Comfortable writing API specs and working with webhooks. A track record of launching products to B2B customers and owning go-to-market with sales. Data-driven: SQL, dashboards and clear success metrics.`,
  ai: `Product Manager, AI Platform (Forward Deployed)
Own the platform that lets enterprise customers build agents on our APIs. You will define how agents use tools through MCP, ship retrieval (RAG) and evaluation pipelines, and make the call between open-weight and hosted models on cost, latency and accuracy. Work directly with customers as a forward-deployed PM, turning field problems into platform features.
Requirements: 4+ years of PM experience on developer or platform products. Hands-on with LLMs, prompt engineering, evals and guardrails. Technical enough to prototype. Experience in regulated industries such as banking or healthcare is a plus.`,
  data: `Staff Product Manager, Data Platform
Lead the strategy for our data platform: streaming ingestion with Kafka, transformation with dbt and Airflow, a lakehouse, and data contracts that keep schemas reliable for downstream teams. Partner with security and legal on data governance, lineage, GDPR and PCI compliance. Own the roadmap, platform economics and SLAs for internal and external consumers.
Requirements: 7+ years of product management, including platform or infrastructure products. A strong technical background and comfort in architecture reviews. Experience with multi-tenant SaaS and enterprise customers.`,
  growth: `Director of Product, Consumer Growth
Lead and manage a team of 6 product managers across activation, retention and monetisation for our consumer app on iOS and Android. Own the experimentation roadmap: A/B testing, funnels, lifecycle and growth loops. Hire, coach and develop PMs.
Requirements: 10+ years of product experience, including 4+ years managing product managers. A proven record growing a consumer mobile app to millions of users. Deep expertise in experimentation and analytics.`,
};
const HOVER = 'a,button,textarea,.lens,.req-h,.tab,.read';
initCursor(HOVER);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const els = {
  jd: $('#jdText'), run: $('#run'), coins: $('#coins'), lenses: $$('.lens'),
  results: $('#results'), tabs: $('#tabs'), panel: $('#tabpanel'),
  flaps: $('#flaps'), band: $('#boardBand'), stamp: $('#boardStamp'), led: $('#boardLed'), boardFor: $('#boardFor'),
  needle: $('#needle'), credit: $('#dialCredit'), dialTitle: $('#dialText'), stats: $('#boardStats'), actions: $('#boardActions'),
  mail: $('#mailBtn'), share: $('#shareBtn'),
};

/* ---------- data ---------- */
let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  els.band.textContent = 'the record did not load';
  throw new Error('career.json failed to load');
}
const profile = getProfile(data);
const BASE = data.base_url;
const href = url => (url && url.startsWith(BASE) ? '../' + url.slice(BASE.length) : url);
const ext = url => !!url && !url.startsWith(BASE) && /^https?:/.test(url);
const linkAttrs = url => `href="${esc(href(url))}"${ext(url) ? ' target="_blank" rel="noopener"' : ''}`;
const kindLabel = r => (r.kind === 'case' ? `Case 0${data.cases.findIndex(c => c.id === r.id) + 1}` : r.kind === 'project' ? 'Built it' : 'Role');
const lower = s => String(s || '').toLowerCase();

/* ---------- the dial: a credit score, 300 to 850 ---------- */
const CX = 150, CY = 150, R = 118;
const pt = (score, r = R) => { const a = Math.PI * (1 - score / 100); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
const arc = (from, to, r = R) => { const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r); return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
$('#dialArcs').innerHTML = `<path d="${arc(0, 100)}" fill="none" stroke="#2a2722" stroke-width="24"/>` +
  [[0, 58, '#FF2D78'], [58, 72, '#E6B547'], [72, 85, '#00CC75'], [85, 100, '#00FF94']].map(([a, b, c]) => `<path d="${arc(a + 0.7, b - 0.7)}" fill="none" stroke="${c}" stroke-width="16"/>`).join('');
$('#dialTicks').innerHTML = [300, 450, 600, 750, 850].map(c => {
  const s = ((c - 300) / 550) * 100;
  const [x, y] = s === 0 || s === 100 ? [pt(s)[0], CY + 18] : pt(s, R + 20);
  return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${c}</text>`;
}).join('');

/* ---------- split-flap digits ---------- */
let flapRun = 0;
function setFlaps(text) {
  const id = ++flapRun;
  const chars = String(text).split('');
  while (els.flaps.children.length < chars.length) els.flaps.insertAdjacentHTML('beforeend', '<span class="flap">-</span>');
  while (els.flaps.children.length > chars.length) els.flaps.lastElementChild.remove();
  [...els.flaps.children].forEach((f, i) => {
    const target = chars[i];
    if (reduceMotion || !/\d/.test(target)) { f.textContent = target; return; }
    let n = 0;
    const spins = 8 + i * 5;
    const tick = () => {
      if (id !== flapRun) return;
      f.textContent = n >= spins ? target : String(Math.floor(Math.random() * 10));
      f.classList.remove('flip'); void f.offsetWidth; f.classList.add('flip');
      if (n++ < spins) setTimeout(tick, 55);
    };
    tick();
  });
}

let shownCredit = null;
function countCredit(target) {
  const from = shownCredit ?? 300;
  shownCredit = target;
  if (reduceMotion) { els.credit.textContent = target; return; }
  const t0 = performance.now();
  const step = now => {
    if (shownCredit !== target) return;
    const k = Math.min((now - t0) / 1000, 1);
    els.credit.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- the scoreboard ---------- */
const STAMP_TONE = { Excellent: 'good', Strong: 'good', Fair: 'mid', Stretch: '' };
function setBoard(fit, { label = 'Fit score', hint } = {}) {
  els.boardFor.textContent = label;
  els.band.className = 'board-band';
  els.stamp.className = 'stamp-x board-stamp';
  if (!fit || fit.score == null) {
    setFlaps('--');
    els.band.innerHTML = `<span class="blink">${esc(hint || 'insert a job')}</span>`;
    els.needle.classList.add('idle'); els.needle.style.transform = '';
    els.credit.textContent = '---'; shownCredit = null;
    els.led.classList.add('off');
    els.stats.innerHTML = '';
    els.actions.hidden = true;
    els.dialTitle.textContent = 'Credit-style score: waiting for input';
    return;
  }
  setFlaps(String(fit.score));
  els.band.textContent = fit.band;
  els.band.classList.add('b-' + lower(fit.band));
  els.needle.classList.remove('idle');
  els.needle.style.transform = `rotate(${(fit.score * 1.8 - 90).toFixed(1)}deg)`;
  countCredit(fit.credit);
  els.led.classList.remove('off');
  els.dialTitle.textContent = `Score ${fit.score} out of 100, ${fit.band}; ${fit.credit} on a 300 to 850 scale`;
  const n = fit.matches.length + fit.gaps.length;
  els.stats.innerHTML = `<li><span>Requirements read</span><b>${n}</b></li>
    <li><span>Well evidenced</span><b>${fit.coverage.evidenced} of ${n}</b></li>
    <li class="${fit.gaps.length ? 'warn' : ''}"><span>Gaps</span><b>${fit.gaps.length}</b></li>`;
  els.actions.hidden = false;
  setTimeout(() => {
    els.stamp.textContent = fit.band;
    els.stamp.classList.add('show');
    if (STAMP_TONE[fit.band]) els.stamp.classList.add(STAMP_TONE[fit.band]);
  }, reduceMotion ? 0 : 900);
}

/* ---------- confetti for an excellent fit ---------- */
function confetti() {
  if (reduceMotion) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#00FF94', '#FF2D78', '#E6B547', '#F3EFE4', '#15130F'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 240}px`);
    p.style.setProperty('--r', `${Math.random() * 900 - 450}deg`);
    p.style.setProperty('--d', `${1.4 + Math.random() * 1.2}s`);
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3200);
}

/* ---------- live coins while you type ---------- */
function setCoins(fit) {
  const rows = fit && fit.score != null ? [...fit.matches, ...fit.gaps] : [];
  const want = new Map(rows.map(r => [r.id, r]));
  for (const li of $$('li[data-id]', els.coins)) if (!want.has(li.dataset.id)) li.remove();
  let i = 0;
  for (const [id, r] of want) {
    if (els.coins.querySelector(`[data-id="${id}"]`)) continue;
    const li = document.createElement('li');
    li.dataset.id = id;
    li.className = fit.gaps.includes(r) ? 'weak' : '';
    li.textContent = r.label;
    li.style.animationDelay = `${i++ * 45}ms`;
    els.coins.append(li);
  }
  let count = $('li.count', els.coins);
  if (rows.length) {
    if (!count) { count = document.createElement('li'); count.className = 'count'; els.coins.prepend(count); }
    count.textContent = `${rows.length} spotted`;
  } else count?.remove();
}

/* ---------- the details ---------- */
const TAG = b => `t-${lower(b)}`;
const meter = m => {
  const on = Math.round(m.confidence * 10);
  return `<span class="meter m-${lower(m.confidence_band)}" role="img" aria-label="confidence ${m.confidence.toFixed(2)}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}" style="animation-delay:${i * 40}ms"></i>`).join('')}</span>`;
};
const W = (name, v) => `<span class="w${v === 1 ? ' hi' : ''}">${name} ${v.toFixed(2)}</span>`;
const quotes = m => (m.evidence.length ? `<ol class="quotes">${m.evidence.map(e => `<li><q>${esc(e.quote)}</q>
  <span class="q-src"><a ${linkAttrs(e.url)}>${esc(e.title)} ↗</a>${W('your words', e.factors.relevance)}${W('owned', e.factors.ownership)}${W('numbers', e.factors.specificity)}${W('recent', e.factors.recency)}${W('day job', e.factors.setting)}<span class="q-e">= ${e.e.toFixed(2)}</span></span></li>`).join('')}</ol>` : '');
const whyBody = m => `<ul class="why">${m.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>${quotes(m)}<p class="math">confidence = <b>${esc(m.math)}</b></p>`;
const reqRow = (m, i, asked) => {
  const words = (m.matched || []).filter(k => !k.startsWith('re:')).filter((k, j, a) => !a.some((o, n) => n !== j && o.includes(k) && o !== k)).slice(0, 3);
  return `<li class="req" style="animation-delay:${i * 50}ms">
    <button type="button" class="req-h" aria-expanded="false">
      <span class="req-l"><b>${esc(m.label)}</b><small>${asked && words.length ? `you asked for ${esc(words.join(', '))}` : esc(m.evidence[0]?.title || m.note || '')}</small></span>
      ${meter(m)}
      <span class="req-c">${m.confidence.toFixed(2)}</span>
      <span class="tag ${TAG(m.confidence_band)}">${esc(m.confidence_band)}</span>
      <span class="req-x" aria-hidden="true">+</span>
    </button>
    <div class="req-b" hidden>${whyBody(m)}</div>
  </li>`;
};

function tabsFor(fit, opts) {
  const asked = opts.mode === 'jd';
  const tabs = [];
  if (opts.persona === 'recruiter') tabs.push({ id: 'facts', label: 'Facts', render: () => {
    const facts = [['Now', `${profile.current.title}, ${profile.current.company} (since ${profile.current.since})`], ['Experience', profile.experience], ['Based in', `${profile.location}. ${profile.open_to}`], ['Travel', profile.travel]];
    return `<div class="tp-head"><h3 class="tp-title">The <em>30-second</em> scan</h3><span class="tp-sub">then check the evidence tab</span></div>
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="nums">${profile.headline_numbers.map(n => `<div><b>${esc(n.value)}</b><span>${esc(n.label)}</span></div>`).join('')}</div>`;
  } });
  tabs.push({ id: 'evidence', label: 'Evidence', count: fit.matches.length, render: () => `
    <div class="tp-head"><h3 class="tp-title">${asked ? 'Your asks' : 'What matters'} → <em>his record</em></h3><span class="tp-sub">tap a row to see why</span></div>
    <ol class="reqs">${fit.matches.map((m, i) => reqRow(m, i, asked)).join('')}</ol>
    ${fit.read_first.length ? `<div class="reads"><p class="reads-h">start with these ↓</p>${fit.read_first.map(r => `<a class="read" ${linkAttrs(r.url)}><span class="read-k">${esc(kindLabel(r))}</span><span class="read-t">${esc(r.title)}</span>${r.metric ? `<span class="read-m">${esc(r.metric)}</span>` : ''}</a>`).join('')}</div>` : ''}` });
  tabs.push({ id: 'gaps', label: 'Gaps', count: fit.gaps.length, warn: fit.gaps.length > 0, render: () => `
    <div class="tp-head"><h3 class="tp-title">Where it's <em>thin</em></h3><span class="tp-sub">said plainly, from his own record</span></div>
    ${fit.notes.length ? `<ul class="warnings">${fit.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${fit.gaps.length ? `<div class="gaps">${fit.gaps.map(g => `<div class="gap"><div class="gap-h"><b>${esc(g.label)}</b><span class="tag ${TAG(g.confidence_band)}">${esc(g.confidence_band)} · ${g.confidence.toFixed(2)}</span></div><p>${esc(g.note || g.reasons[0] || '')}</p>${meter(g)}</div>`).join('')}</div>`
      : '<span class="sticker neon all-clear">nothing here he can\'t back up</span>'}` });
  tabs.push({ id: 'ask', label: 'Ask him', count: fit.questions.length, render: () => `
    <div class="tp-head"><h3 class="tp-title">Questions for <em>the call</em></h3><button type="button" class="btn paper sm" data-copy-qs>Copy all</button></div>
    <ol class="asks">${fit.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>` });
  tabs.push({ id: 'how', label: 'Scoring', render: () => `
    <div class="tp-head"><h3 class="tp-title">No AI, <em>just arithmetic</em></h3><span class="tp-sub">same job description, same answer, every time</span></div>
    <div class="how">
      <div><b>Your words</b><span>1.0 if the line uses them, 0.7 if his record links it</span></div>
      <div><b>Owned</b><span>1.0 if he owned or led it, 0.85 if not</span></div>
      <div><b>Numbers</b><span>1.0 if it carries a result, 0.85 if not</span></div>
      <div><b>Recent</b><span>1.0 this year, 0.9 within three, 0.75 older</span></div>
      <div><b>Day job</b><span>1.0 at work, 0.85 for a side project</span></div>
    </div>
    <p class="how-p">Each quoted line is worth those five multiplied together. Lines from the same product or project count once (one role can run two products). Different places add up like independent examples:</p>
    <span class="how-f">confidence = 1 − Π(1 − 0.75 × place)</span>
    <p class="how-p">So one strong place reaches 0.75, and "Strong" needs evidence from two. His own self-assessment can only lower a score (a declared gap caps it at 0.15), never raise it. The fit is the average across your requirements, weighted by how often you ask for each, and a must-have with nothing behind it caps the fit at 44. Everything comes from his own record; much of it is internal to employers, so nothing is checked against the web.</p>` });
  return tabs;
}

let tabs = [], activeTab = null;
function renderTabs() {
  els.tabs.innerHTML = tabs.map(t => `<button type="button" class="tab${t.warn ? ' warn' : ''}" role="tab" id="tab-${t.id}" aria-selected="false" aria-controls="tabpanel" data-tab="${t.id}">${esc(t.label)}${t.count != null ? ` <b>${t.count}</b>` : ''}</button>`).join('');
}
function openTab(id, { focus = false } = {}) {
  const t = tabs.find(x => x.id === id) || tabs[0];
  activeTab = t.id;
  for (const b of $$('.tab', els.tabs)) { const on = b.dataset.tab === t.id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  els.panel.setAttribute('aria-labelledby', `tab-${t.id}`);
  els.panel.innerHTML = t.render();
  if (focus) $(`#tab-${t.id}`).focus();
}
els.tabs.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) openTab(b.dataset.tab); });
els.tabs.addEventListener('keydown', e => {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  const i = tabs.findIndex(t => t.id === activeTab);
  openTab(tabs[(i + d + tabs.length) % tabs.length].id, { focus: true });
});
els.panel.addEventListener('click', async e => {
  const h = e.target.closest('.req-h');
  if (h) {
    const open = h.getAttribute('aria-expanded') === 'true';
    h.setAttribute('aria-expanded', String(!open));
    h.nextElementSibling.hidden = open;
    return;
  }
  if (e.target.closest('[data-copy-qs]')) copy(state.fit.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'), 'Questions copied');
});

/* ---------- run ---------- */
let state = null;
let celebrated = new Set();
function show(fit, opts, { scroll = true } = {}) {
  state = { fit, ...opts };
  const label = opts.mode === 'persona' ? `${PERSONAS[opts.persona].label} lens` : opts.title ? `Fit for · ${opts.title}` : 'Fit score';
  if (fit.score == null) {
    setBoard(null, { hint: 'paste a fuller job' });
    els.results.hidden = false;
    tabs = [];
    els.tabs.innerHTML = '';
    els.panel.innerHTML = `<p class="fx-empty">${esc(fit.message)}</p>`;
    return;
  }
  setBoard(fit, { label });
  tabs = tabsFor(fit, opts);
  renderTabs();
  els.results.hidden = false;
  openTab(tabs[0].id);
  const key = `${opts.mode}|${opts.persona || ''}|${fit.score}`;
  if (fit.band === 'Excellent' && !celebrated.has(key)) { celebrated.add(key); setTimeout(confetti, reduceMotion ? 0 : 1100); }
  els.mail.href = mailto(label);
  syncUrl();
  if (scroll && matchMedia('(max-width: 980px)').matches) $('#board').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

let tType;
function onType() {
  for (const b of els.lenses) b.setAttribute('aria-pressed', 'false');
  clearTimeout(tType);
  tType = setTimeout(() => {
    const text = els.jd.value.trim();
    els.run.disabled = text.length < 40;
    setCoins(text ? fitFor(data, text) : null);
  }, 140);
}
function run() {
  const text = els.jd.value.trim();
  if (text.length < 10) return;
  const fit = fitFor(data, text);
  setCoins(fit);
  show(fit, { mode: 'jd', title: fit.title });
}
els.jd.addEventListener('input', onType);
els.jd.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } });
els.run.addEventListener('click', run);
$$('[data-sample]').forEach(b => b.addEventListener('click', () => {
  els.jd.value = SAMPLES[b.dataset.sample];
  els.jd.scrollTop = 0;
  onType();
  els.run.disabled = false;
  setTimeout(run, reduceMotion ? 0 : 250);
}));
els.lenses.forEach(b => b.addEventListener('click', () => {
  for (const x of els.lenses) x.setAttribute('aria-pressed', String(x === b));
  els.jd.value = '';
  setCoins(null);
  els.run.disabled = true;
  show(fitFor(data, '', { persona: b.dataset.persona }), { mode: 'persona', persona: b.dataset.persona });
}));

/* ---------- share, email, toast ---------- */
function shareUrl() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  if (state?.mode === 'persona') u.searchParams.set('as', state.persona);
  else if (state?.fit?.detected?.length) {
    u.searchParams.set('k', state.fit.detected.map(d => `${d.id}~${Math.round(d.w * 2)}`).join(','));
    if (state.title) u.searchParams.set('t', state.title);
  }
  return u;
}
function syncUrl() { try { history.replaceState(null, '', state ? shareUrl() : location.pathname); } catch { /* sandboxed */ } }
function mailto(subject) {
  const body = `Hi Parth,\n\n[a line about the role]\n\n(I ran your fit check: ${shareUrl().href})`;
  return `mailto:${data.profile.contact.email}?subject=${encodeURIComponent(`About ${subject.replace(/^Fit for · /, '')}`)}&body=${encodeURIComponent(body)}`;
}
let toastT;
function toast(msg) {
  $('.toast-x')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast-x" role="status">${esc(msg)}</div>`);
  clearTimeout(toastT);
  toastT = setTimeout(() => $('.toast-x')?.remove(), 2400);
}
async function copy(text, what) { try { await navigator.clipboard.writeText(text); toast(what); } catch { prompt('Copy this:', text); } }
els.share.addEventListener('click', () => copy(shareUrl().href, 'Link copied · no job text in it'));

/* ---------- restore a shared view ---------- */
const q = new URLSearchParams(location.search);
if (q.get('as') && PERSONAS[q.get('as')]) {
  els.lenses.find(x => x.dataset.persona === q.get('as'))?.setAttribute('aria-pressed', 'true');
  show(fitFor(data, '', { persona: q.get('as') }), { mode: 'persona', persona: q.get('as') }, { scroll: false });
} else if (q.get('k')) {
  const items = q.get('k').split(',').map(s => { const [id, w] = s.split('~'); return { id, w: (+w || 2) / 2 }; }).slice(0, 30);
  const title = (q.get('t') || '').slice(0, 90) || null;
  const fit = fitFromIds(data, items, title);
  if (fit.score != null) show(fit, { mode: 'link', title }, { scroll: false });
} else {
  setBoard(null);
}
