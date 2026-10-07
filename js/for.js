// "For you": the portfolio rebuilt around one reader.
// Everything runs in the browser against data/career.json - a pasted job description never leaves the page.

import { fitFor, fitFromIds, getProfile, PERSONAS } from './career-engine.js';
import { initCursor } from './cursor.js';

initCursor('a,button,.persona,.read,textarea,.lg-row');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

const HEADS = {
  recruiter: { kicker: 'Rebuilt for · a recruiter', title: 'The 30-second <em>scan</em>' },
  'hiring-manager': { kicker: 'Rebuilt for · a hiring manager', title: 'How he\'d show up on <em>your team</em>' },
  engineer: { kicker: 'Rebuilt for · an engineer', title: 'The technical <em>evidence</em>' },
  founder: { kicker: 'Rebuilt for · a founder', title: 'Range, speed and <em>judgement</em>' },
};

const els = {
  personas: $$('.persona'), jd: $('#jdText'), live: $('#jdLive'), results: $('#results'),
  card: $('.dial-card'), needle: $('#needle'), credit: $('#dialCredit'), band: $('#dialBand'), fit: $('#dialFit'), title: $('#dialText'),
};

/* ---------- data ---------- */
let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  els.results.hidden = false;
  els.results.innerHTML = '<p class="fr-empty">The career record didn\'t load. The <a href="../">full portfolio</a> has everything.</p>';
  throw new Error('career.json failed to load');
}
const profile = getProfile(data);
const BASE = data.base_url;
// links inside the portfolio stay relative, so the page works on any host
const href = url => (url && url.startsWith(BASE) ? '../' + url.slice(BASE.length) : url);
const ext = url => !!url && !url.startsWith(BASE) && /^https?:/.test(url);
const linkAttrs = url => `href="${esc(href(url))}"${ext(url) ? ' target="_blank" rel="noopener"' : ''}`;
const kindLabel = r => (r.kind === 'case' ? `Case ${String(data.cases.findIndex(c => c.id === r.id) + 1).padStart(2, '0')}` : r.kind === 'project' ? 'Built it' : 'Role');

/* ---------- the dial ---------- */
const CX = 150, CY = 150, R = 118;
const pt = (score, r = R) => {
  const a = Math.PI * (1 - score / 100);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};
const arc = (from, to, r = R) => {
  const [x1, y1] = pt(from, r), [x2, y2] = pt(to, r);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
};
const BANDS = [[0, 58, '#FF2D78'], [58, 72, '#E6B547'], [72, 85, '#00CC75'], [85, 100, '#00FF94']];
$('#dialArcs').innerHTML =
  `<path d="${arc(0, 100)}" fill="none" stroke="#E6DFC9" stroke-width="22"/>` +
  BANDS.map(([a, b, c]) => `<path d="${arc(a + 0.6, b - 0.6)}" fill="none" stroke="${c}" stroke-width="14"/>`).join('') +
  `<path d="${arc(0, 100, R - 15)}" fill="none" stroke="#15130F" stroke-width="1" stroke-dasharray="1 5"/>`;
$('#dialTicks').innerHTML = [300, 450, 600, 750, 850].map(c => {
  const s = ((c - 300) / 550) * 100;
  const [x, y] = s === 0 || s === 100 ? [pt(s)[0], CY + 17] : pt(s, R + 18);
  return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}">${c}</text>`;
}).join('');

let shownCredit = null;
function setDial(fit, hint) {
  const card = els.card;
  card.classList.remove('b-excellent', 'b-strong', 'b-fair', 'b-stretch');
  if (!fit || fit.score == null) {
    els.needle.classList.add('idle');
    els.needle.style.transform = '';
    els.credit.textContent = '- - -';
    els.band.textContent = hint ? 'keep going' : 'waiting for you';
    els.fit.textContent = hint || 'pick a reader or paste a JD';
    els.title.textContent = 'Fit score: waiting for input';
    shownCredit = null;
    $('.dc-go')?.remove();
    return;
  }
  els.needle.classList.remove('idle');
  els.needle.style.transform = `rotate(${(fit.score * 1.8 - 90).toFixed(1)}deg)`;
  card.classList.add('b-' + fit.band.toLowerCase());
  els.band.textContent = fit.band;
  const n = fit.matches.length + fit.gaps.length;
  els.fit.textContent = `${fit.score}/100 fit · ${n} requirement${n === 1 ? '' : 's'} read`;
  els.title.textContent = `Fit score ${fit.credit} of 850: ${fit.band}`;
  countTo(fit.credit);
  if (!$('.dc-go')) card.insertAdjacentHTML('beforeend', '<a class="dc-go" href="#results">See the evidence <span aria-hidden="true">↓</span></a>');
}
function countTo(target) {
  const from = shownCredit ?? 300;
  shownCredit = target;
  if (reduceMotion || from === target) { els.credit.textContent = target; return; }
  const t0 = performance.now(), dur = 900;
  const step = now => {
    if (shownCredit !== target) return;
    const k = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
    els.credit.textContent = Math.round(from + (target - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- live requirement chips ---------- */
function setChips(fit) {
  const want = new Map([...(fit?.matches || []), ...(fit?.gaps || [])].map(m => [m.id, m]));
  for (const li of $$('li', els.live)) if (!want.has(li.dataset.id)) li.remove();
  let i = 0;
  for (const [id, m] of want) {
    if (els.live.querySelector(`[data-id="${id}"]`)) continue;
    const li = document.createElement('li');
    li.dataset.id = id;
    li.className = 's-' + m.strength;
    li.title = m.strength_label;
    li.textContent = m.label;
    li.style.animationDelay = `${i++ * 45}ms`;
    els.live.append(li);
  }
}

/* ---------- the rebuilt page ---------- */
const block = (title, body, extra = '') => `<section class="fr-block"${extra}><h3 class="fr-h">${title}</h3>${body}</section>`;

function ledger(items, { limit = 8, asked = false } = {}) {
  const used = new Set();
  return `<div class="ledger">${items.slice(0, limit).map((m, i) => {
    // don't quote the same line twice: take the first unshown evidence of the same weight (work, not side projects)
    const lead = m.evidence[0];
    const e = lead && (!used.has(lead.quote) ? lead : m.evidence.find(x => !used.has(x.quote) && (x.kind !== 'project' || lead.kind === 'project')) || lead);
    if (e) used.add(e.quote);
    const more = m.evidence.length > 1 ? ` · +${m.evidence.length - 1} more` : '';
    const words = (m.matched || []).filter(k => !k.startsWith('re:')).filter((k, j, a) => !a.some((o, n) => n !== j && o.includes(k) && o !== k)).slice(0, 3);
    const said = asked && words.length ? `<span class="lg-asked">you wrote: ${esc(words.join(', '))}</span>` : '';
    return `<div class="lg-row" style="animation-delay:${i * 70}ms">
      <div><p class="lg-req">${esc(m.label)}</p><span class="lg-badge s-${m.strength}">${esc(m.strength_label)}</span>${said}</div>
      <p class="lg-quote">${e ? `<q>${esc(e.quote)}</q><span class="lg-more">${esc(e.title)}${more}</span>` : esc(m.note || '')}</p>
      ${e ? `<a class="lg-src" ${linkAttrs(e.url)}>See it <span aria-hidden="true">→</span></a>` : '<span></span>'}
    </div>`;
  }).join('')}</div>`;
}

const readCard = (r, i) => `<a class="read" ${linkAttrs(r.url)}>
  <span class="read-n">${String(i + 1).padStart(2, '0')} · ${esc(kindLabel(r))}</span>
  <span class="read-t">${esc(r.title)}</span>
  ${r.metric ? `<span class="read-m">${esc(r.metric)}</span>` : ''}
  <span class="read-s">${esc(r.summary)}</span>
</a>`;

const projectCard = (p, i) => `<a class="read" href="${esc(p.url)}" target="_blank" rel="noopener">
  <span class="read-n">${String(i + 1).padStart(2, '0')} · Built solo</span>
  <span class="read-t">${esc(p.name)}</span>
  <span class="read-s">${esc(p.tagline)}</span>
  <span class="chips">${p.built_with.slice(0, 4).map(s => `<span>${esc(s)}</span>`).join('')}</span>
</a>`;

function gapsBlock(fit) {
  const body = fit.gaps.length
    ? `<div class="gaps">${fit.gaps.map(g => `<div class="gap"><h4>${esc(g.label)} <span class="lg-badge s-${g.strength}">${esc(g.strength_label)}</span></h4><p>${esc(g.note || 'Thin evidence on record. Ask him about it.')}</p></div>`).join('')}</div>`
    : '<p class="gap-none">Nothing in here he can\'t back up. Check the ledger anyway.</p>';
  return block('Where it\'s <b>thin</b> · said plainly', body);
}
const shortBlock = lines => block('The short version', `<ul class="fr-short">${lines.map(l => `<li>${l}</li>`).join('')}</ul>`);
const questionsBlock = qs => (qs.length ? block('Ask him this', `<ol class="qs">${qs.map(q => `<li>${esc(q)}</li>`).join('')}</ol>`) : '');
const readsBlock = (items, title = 'Read these first') => (items.length ? block(title, `<div class="reads">${items.map(readCard).join('')}</div>`) : '');
const summaryLines = fit => fit.summary.map(s => {
  const [label, ...rest] = s.split(': ');
  return `<b>${esc(label)}</b>${esc(rest.join(': '))}`;
});

function mailto(subject) {
  const body = `Hi Parth,\n\n[a line about the role]\n\n(Found you via ${location.href})`;
  return `mailto:${data.profile.contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function cta(subject) {
  return `<div class="fr-cta fr-block">
    <p>Seen enough? <em>${esc(data.profile.contact.preferred)}</em></p>
    <div class="fr-actions">
      <a class="fr-btn primary" href="${esc(mailto(subject))}">Email Parth <span aria-hidden="true">↗</span></a>
      <a class="fr-btn" href="../mcp/">Let your AI interview him</a>
      <a class="fr-btn" href="../">The full portfolio</a>
    </div>
  </div>`;
}

function render(fit, { mode, persona, title }) {
  const r = els.results;
  if (!fit || fit.score == null) {
    r.hidden = !fit;
    if (fit) r.innerHTML = `<p class="fr-empty">${esc(fit.message)}</p>`;
    return;
  }
  const head = mode === 'persona' ? HEADS[persona]
    : { kicker: mode === 'link' ? 'Rebuilt for · a shared role' : 'Rebuilt for · the role you pasted', title: `Rebuilt for <em>${esc(title || 'this role')}</em>` };
  const subject = mode === 'persona' ? `Hello from a ${PERSONAS[persona].label.toLowerCase()}` : `About ${title || 'a role'}`;
  const parts = [];

  if (mode === 'persona' && persona === 'recruiter') {
    const facts = [
      ['Now', `${profile.current.title}, ${profile.current.company} (since ${profile.current.since})`],
      ['Experience', profile.experience],
      ['Based in', `${profile.location}. ${profile.open_to}`],
      ['Travel', profile.travel],
    ];
    parts.push(block('Quick facts', `<dl class="facts">${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`));
    parts.push(shortBlock(profile.headline_numbers.map(n => `<b>${esc(n.value)}</b>${esc(n.label)}`)));
    parts.push(block('Strongest at', ledger(fit.matches, { limit: 6 })));
    parts.push(readsBlock(fit.read_first));
    parts.push(gapsBlock(fit));
  } else if (mode === 'persona' && persona === 'hiring-manager') {
    parts.push(shortBlock(summaryLines(fit)));
    parts.push(block('How he decides', `<ul class="fr-short principles">${profile.principles.map(p => {
      const [lead, ...rest] = p.split(': ');
      return `<li>${rest.length ? `<b>${esc(lead)}</b>${esc(rest.join(': '))}` : esc(p)}</li>`;
    }).join('')}</ul>`));
    parts.push(block('Requirement → evidence', ledger(fit.matches)));
    parts.push(readsBlock(fit.read_first));
    parts.push(gapsBlock(fit));
    parts.push(questionsBlock(fit.questions));
  } else if (mode === 'persona' && persona === 'engineer') {
    parts.push(shortBlock(summaryLines(fit)));
    parts.push(block('Requirement → evidence', ledger(fit.matches)));
    parts.push(block('Things he built, and how', `<div class="reads">${data.projects.slice(0, 4).map(projectCard).join('')}</div>`));
    parts.push(gapsBlock(fit));
    parts.push(questionsBlock(fit.questions));
  } else if (mode === 'persona' && persona === 'founder') {
    parts.push(shortBlock(summaryLines(fit)));
    parts.push(block(`Shipped solo · <b>${data.projects.length} live</b>`, `<div class="reads">${data.projects.map(projectCard).join('')}</div>`));
    parts.push(block('Requirement → evidence', ledger(fit.matches, { limit: 6 })));
    parts.push(readsBlock(fit.read_first.filter(x => x.kind === 'case'), 'The big rooms'));
    parts.push(gapsBlock(fit));
  } else {
    parts.push(shortBlock(summaryLines(fit)));
    parts.push(block(`Your requirements → his evidence · <b>${fit.matches.length} matched</b>`, ledger(fit.matches, { limit: 12, asked: true })));
    parts.push(gapsBlock(fit));
    if (fit.notes.length) parts.push(block('Worth knowing', `<ul class="notes">${fit.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`));
    parts.push(readsBlock(fit.read_first));
    if (fit.also.length) parts.push(block('Also brings · you didn\'t ask', `<div class="chips also">${fit.also.map(a => `<span>${esc(a.label)}</span>`).join('')}</div>`));
    parts.push(questionsBlock(fit.questions));
  }
  parts.push(cta(subject));

  r.innerHTML = `<header class="fr-head">
      <div><p class="fr-kicker">${esc(head.kicker)}</p><h2 class="fr-title">${head.title}</h2></div>
      <div class="fr-actions">
        <button type="button" class="fr-btn" data-act="share">Copy a link to this view</button>
        <a class="fr-btn primary" href="${esc(mailto(subject))}">Email Parth <span aria-hidden="true">↗</span></a>
      </div>
    </header>` + parts.join('');
  r.hidden = false;
}

/* ---------- state ---------- */
let state = { mode: null };
let lastKey = '';

function shareUrl() {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  if (state.mode === 'persona') u.searchParams.set('as', state.persona);
  else if (state.fit?.detected?.length) {
    u.searchParams.set('k', state.fit.detected.map(d => `${d.id}~${Math.round(d.w * 2)}`).join(','));
    if (state.title) u.searchParams.set('t', state.title);
  }
  return u;
}
function syncUrl() {
  try { history.replaceState(null, '', state.mode ? shareUrl() : location.pathname); } catch { /* file:// or sandboxed */ }
}

function apply(fit, opts, { scroll = false } = {}) {
  state = { ...opts, fit };
  setDial(fit);
  const key = `${opts.mode}|${opts.persona || ''}|${opts.title || ''}|${(fit.detected || []).map(d => d.id + d.w).join(',')}`;
  if (key !== lastKey) { lastKey = key; render(fit, opts); }
  syncUrl();
  if (scroll) {
    const rect = els.card.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > innerHeight) els.card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  }
}

function pickPersona(id, opts) {
  for (const b of els.personas) b.setAttribute('aria-pressed', String(b.dataset.persona === id));
  els.jd.value = '';
  setChips(null);
  apply(fitFor(data, '', { persona: id }), { mode: 'persona', persona: id }, opts);
}

let tChips, tPage;
function onType({ instant = false } = {}) {
  const text = els.jd.value;
  for (const b of els.personas) b.setAttribute('aria-pressed', 'false');
  clearTimeout(tChips); clearTimeout(tPage);
  const run = () => {
    if (!text.trim()) {
      state = { mode: null }; lastKey = '';
      setChips(null); setDial(null); render(null, {}); syncUrl();
      return;
    }
    const fit = fitFor(data, text);
    setChips(fit);
    if (text.trim().length < 60) {
      const n = fit.matches.length + fit.gaps.length;
      setDial(null, n ? `${n} so far · keep pasting` : 'keep pasting');
      return;
    }
    if (instant) apply(fit, { mode: 'jd', title: fit.title });
    else {
      setDial(fit);
      // the rebuilt page waits for a pause in typing, so it doesn't redraw on every key
      tPage = setTimeout(() => apply(fit, { mode: 'jd', title: fit.title }), 650);
    }
  };
  if (instant) run(); else tChips = setTimeout(run, 160);
}

els.personas.forEach(b => b.addEventListener('click', () => {
  if (b.getAttribute('aria-pressed') === 'true') return;
  pickPersona(b.dataset.persona, { scroll: true });
}));
els.jd.addEventListener('input', () => onType());
$$('[data-sample]').forEach(b => b.addEventListener('click', () => {
  els.jd.value = SAMPLES[b.dataset.sample];
  els.jd.scrollTop = 0;
  onType({ instant: true });
}));

let toastT;
function toast(msg) {
  $('.copied')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="copied" role="status">${esc(msg)}</div>`);
  clearTimeout(toastT);
  toastT = setTimeout(() => $('.copied')?.remove(), 2200);
}
els.results.addEventListener('click', async e => {
  if (!e.target.closest('[data-act="share"]')) return;
  const url = shareUrl().href;
  try { await navigator.clipboard.writeText(url); toast('Link copied · no JD text in it'); }
  catch { prompt('Copy this link:', url); }
});

/* ---------- restore a shared view ---------- */
const q = new URLSearchParams(location.search);
if (q.get('as') && PERSONAS[q.get('as')]) {
  pickPersona(q.get('as'));
} else if (q.get('k')) {
  const items = q.get('k').split(',').map(s => { const [id, w] = s.split('~'); return { id, w: (+w || 2) / 2 }; }).slice(0, 30);
  const title = (q.get('t') || '').slice(0, 90) || null;
  const fit = fitFromIds(data, items, title);
  if (fit.score != null) { setChips(fit); apply(fit, { mode: 'link', title }); }
} else {
  setDial(null);
}
