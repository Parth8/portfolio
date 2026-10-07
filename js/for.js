// Fit check: an audit of Parth against a job description, run entirely in the browser.
// Scores come from js/career-engine.js; public sources are re-checked live from the visitor's browser.

import { fitFor, fitFromIds, PERSONAS } from './career-engine.js';
import { checkRepo, checkReachable, fmtDay } from './live-audit.js';

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
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TIER = { verified: 'Verified', corroborated: 'Corroborated', self: 'Self-reported' };

const els = { jd: $('#jdText'), run: $('#run'), detected: $('#detected'), results: $('#results'), lenses: $$('.lens') };
addEventListener('scroll', () => $('#bar').classList.toggle('scrolled', scrollY > 8), { passive: true });
const revealer = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }));
$$('[data-reveal]').forEach(el => revealer.observe(el));

let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  els.results.hidden = false;
  els.results.innerHTML = '<p class="empty card">The career record didn\'t load. The <a href="../">portfolio</a> has the same evidence.</p>';
  throw new Error('career.json failed to load');
}
const BASE = data.base_url;
const href = url => (url && url.startsWith(BASE) ? '../' + url.slice(BASE.length) : url);
const ext = url => !!url && /^https?:/.test(url) && !url.startsWith(BASE);
const linkAttrs = url => `href="${esc(href(url))}"${ext(url) ? ' target="_blank" rel="noopener"' : ''}`;
const proofChip = t => `<span class="proof" data-tier="${t}">${TIER[t]}</span>`;
const kwRe = k => new RegExp(`(^|[^a-z0-9])(${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\-|\s+/g, '[\\s-]?')})(?=$|[^a-z0-9])`, 'gi');
function highlight(quote, words) {
  let h = esc(quote);
  for (const w of words.filter(x => !x.startsWith('re:')).sort((a, b) => b.length - a.length)) h = h.replace(kwRe(esc(w)), '$1<mark>$2</mark>');
  return h;
}

/* ---------- typing: requirement chips light up as you paste ---------- */
let tChips;
function onType() {
  for (const b of els.lenses) b.setAttribute('aria-pressed', 'false');
  clearTimeout(tChips);
  tChips = setTimeout(() => {
    const text = els.jd.value.trim();
    els.run.disabled = text.length < 40;
    const fit = text ? fitFor(data, text) : null;
    const rows = fit && fit.score != null ? [...fit.matches, ...fit.gaps] : [];
    const want = new Map(rows.map(r => [r.id, r]));
    for (const li of $$('li', els.detected)) if (!want.has(li.dataset.id)) li.remove();
    let i = 0;
    for (const [id, r] of want) {
      if (els.detected.querySelector(`[data-id="${id}"]`)) continue;
      const li = document.createElement('li');
      li.dataset.id = id;
      li.className = r.confidence < 0.4 ? 'weak' : '';
      li.textContent = r.label;
      li.style.animationDelay = `${i++ * 40}ms`;
      els.detected.append(li);
    }
  }, 150);
}
els.jd.addEventListener('input', onType);
els.jd.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !els.run.disabled) run(); });
$$('[data-sample]').forEach(b => b.addEventListener('click', () => { els.jd.value = SAMPLES[b.dataset.sample]; els.jd.scrollTop = 0; onType(); setTimeout(run, 180); }));
els.run.addEventListener('click', () => run());
els.lenses.forEach(b => b.addEventListener('click', () => {
  for (const x of els.lenses) x.setAttribute('aria-pressed', String(x === b));
  els.jd.value = '';
  els.detected.innerHTML = '';
  els.run.disabled = true;
  show(fitFor(data, '', { persona: b.dataset.persona }), { mode: 'persona', persona: b.dataset.persona });
}));

function run() {
  const text = els.jd.value.trim();
  if (!text) return;
  const fit = fitFor(data, text);
  show(fit, { mode: 'jd', title: fit.title });
}

/* ---------- the audit ---------- */
let state = null;
function show(fit, opts, { scroll = true } = {}) {
  state = { fit, ...opts };
  const r = els.results;
  r.hidden = false;
  if (fit.score == null) {
    r.innerHTML = `<p class="empty card">${esc(fit.message)}</p>`;
    syncUrl();
    return;
  }
  const title = opts.mode === 'persona' ? `${PERSONAS[opts.persona].label} lens` : opts.title || 'this role';
  const rows = [...fit.matches, ...fit.gaps];
  const mix = fit.evidence_mix, mixTotal = mix.verified + mix.corroborated + mix.self || 1;
  const bandCls = fit.score >= 80 ? 'b-strong' : fit.score < 45 ? 'b-stretch' : '';

  r.innerHTML = `
    <div class="score card">
      <div class="sc-main">
        <p class="eyebrow sc-for">Fit for · ${esc(title)}</p>
        <p class="sc-num"><span class="num" id="scNum">${reduce ? fit.score : 0}</span><span class="sc-of">/100</span></p>
        <p class="sc-band ${bandCls}">${esc(fit.band)}</p>
      </div>
      <div class="sc-detail">
        <div class="meter" role="img" aria-label="Score ${fit.score} out of 100, range ${fit.range.low} to ${fit.range.high}">
          <div class="m-range" style="left:${fit.range.low}%;width:${Math.max(fit.range.high - fit.range.low, 1)}%"></div>
          <div class="m-mark" style="left:${reduce ? fit.score : 0}%"></div>
        </div>
        <div class="m-ticks" aria-hidden="true"><span style="left:0">0</span><span style="left:45%">45</span><span style="left:65%">65</span><span style="left:80%">80</span><span style="left:100%">100</span></div>
        <p class="sc-range"><b>Range ${fit.range.low}–${fit.range.high}.</b> ${fit.range.low} if you discount his resume, ${fit.range.high} if references confirm it. Public proof doesn't move.</p>
        <div class="mix" aria-hidden="true">${['verified', 'corroborated', 'self'].map(t => `<i class="t-${t}" style="width:${(mix[t] / mixTotal) * 100}%"></i>`).join('')}</div>
        <div class="legend">${['verified', 'corroborated', 'self'].map(t => `<span class="proof" data-tier="${t}">${mix[t]} ${TIER[t]}</span>`).join('')}</div>
      </div>
      <div class="sc-actions">
        <button type="button" class="btn sm" data-act="share">Copy link</button>
        <a class="btn sm primary" href="${esc(mailto(title))}">Email Parth <span aria-hidden="true">↗</span></a>
      </div>
    </div>

    <div class="live card" id="live">
      <p class="live-h"><i></i>Live checks</p>
      <p class="live-sum" id="liveSum">Re-checking every public source from your browser…</p>
      <ol class="live-log" id="liveLog"></ol>
    </div>

    <section class="block">
      <div class="block-h"><h2 class="h3">Requirement by requirement</h2><span class="muted">${rows.length} found · tap any row for the evidence and the math</span></div>
      <ol class="reqs">${rows.map(reqRow).join('')}</ol>
    </section>

    ${fit.read_first.length ? `<section class="block">
      <div class="block-h"><h2 class="h3">Read these first</h2><span class="muted">The records carrying most of this score</span></div>
      <div class="reads">${fit.read_first.map(x => `<a class="read card" ${linkAttrs(x.portfolio || x.url)}>${proofChip(x.proof)}<b>${esc(x.title)}</b>${x.metric ? `<span class="num">${esc(x.metric)}</span>` : ''}</a>`).join('')}</div>
    </section>` : ''}

    <section class="block two">
      <div class="panel card">
        <h3 class="h3">Ask him this</h3>
        <ol class="plist">${fit.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
      </div>
      <div class="panel card">
        <h3 class="h3">Worth knowing</h3>
        <ul class="plist">${(fit.notes.length ? fit.notes : ['Nothing beyond the requirements above.']).map(n => `<li>${esc(n)}</li>`).join('')}
        </ul>
      </div>
    </section>

    <details class="method card block">
      <summary>How this is scored</summary>
      <div class="method-body">
        <p>Every requirement gets a <b>confidence</b> from 0 to 1: how sure you can be that he has it, given who can vouch for the evidence.</p>
        <p>Each piece of evidence is worth <code>proof × recency × specificity × relevance</code>.</p>
        <table>
          <tr><th>Factor</th><th>Values</th></tr>
          <tr><td>Proof</td><td>verified 0.95 · corroborated 0.70 · self-reported 0.60</td></tr>
          <tr><td>Recency</td><td>within a year 1.0 · within three 0.9 · older 0.75</td></tr>
          <tr><td>Specificity</td><td>has a number 1.0 · no number 0.85</td></tr>
          <tr><td>Relevance</td><td>matches your words 1.0 · linked by his record only 0.7</td></tr>
        </table>
        <p>Evidence is grouped by <b>witness</b>. Every public artifact (a live app, a public repo) is its own witness. Everything whose claims come from his resume counts as <b>one</b> witness, however many lines agree: it can't go above 0.72, or 0.82 when press or company pages confirm the programs. So "High" (0.85+) always needs something you can open and check. Witnesses combine like independent checks: <code>confidence = 1 − (1 − w₁)(1 − w₂)…</code>, held at 0.98 because nothing is certain.</p>
        <p>His own self-assessment can only <b>lower</b> a score (a declared gap caps at 0.15, adjacent at 0.45, working knowledge at 0.70). It never raises one.</p>
        <p>Fit is the weighted average of confidence across your requirements (asked more often, weighs more), × 100. The range re-runs the same maths with resume claims at 0.4 (sceptical) and 0.9 (references confirm).</p>
        <p>No AI writes this page. It's ${'<a class="link" href="https://github.com/Parth8/portfolio/blob/main/js/career-engine.js" target="_blank" rel="noopener">under 500 lines of JavaScript</a>'} over <a class="link" href="../data/career.json">one public JSON file</a>; the same input always gives the same answer.</p>
      </div>
    </details>

    <div class="cta card">
      <p>Seen enough? <em>A line about the role is plenty.</em></p>
      <div class="sc-actions" style="flex-direction:row;flex-wrap:wrap">
        <a class="btn green" href="${esc(mailto(title))}">Email Parth <span aria-hidden="true">↗</span></a>
        <a class="btn" href="../mcp/">Let your AI interview him</a>
        <a class="btn" href="../">The portfolio</a>
      </div>
    </div>`;

  // the score arrives: count up, needle slides
  if (!reduce) {
    requestAnimationFrame(() => { $('.m-mark', r).style.left = `${fit.score}%`; });
    const el = $('#scNum'), t0 = performance.now();
    const tick = now => { const k = Math.min((now - t0) / 1100, 1); el.textContent = Math.round(fit.score * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  $$('.req', r).forEach((li, i) => { li.style.animationDelay = `${120 + i * 55}ms`; $('.req-bar i', li).style.animationDelay = `${300 + i * 55}ms`; });
  syncUrl();
  if (scroll) r.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  liveChecks(rows);
}

function reqRow(m) {
  const asked = m.matched.filter(k => !k.startsWith('re:')).slice(0, 3);
  return `<li class="req" data-band="${m.band}">
    <button type="button" class="req-head" aria-expanded="false">
      <span class="req-l"><b>${esc(m.label)}</b><small>${asked.length && state.mode !== 'persona' ? `you asked for ${esc(asked.join(', '))}` : esc(m.reasons[0] || '')}</small></span>
      <span class="req-bar" aria-hidden="true"><i style="width:${Math.max(m.confidence * 100, 2)}%"></i></span>
      <span class="req-c num">${m.confidence.toFixed(2)}</span>
      <span class="req-b">${m.band}</span>
      <span class="req-x" aria-hidden="true">+</span>
    </button>
    <div class="req-body" hidden>
      <ul class="reasons">${m.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      ${m.confidence < 0.4 && m.note ? `<p class="note">On record: ${esc(m.note)}</p>` : ''}
      ${m.evidence.length ? `<ol class="ev">${m.evidence.map(evItem).join('')}</ol>` : ''}
      <p class="math">confidence = ${esc(m.math)}</p>
    </div>
  </li>`;
}

function evItem(e) {
  const f = e.factors;
  const pub = e.sources.filter(s => s.kind !== 'self');
  return `<li class="ev-i">
    <div class="ev-h">${proofChip(e.proof)}<a ${linkAttrs(e.url)}>${esc(e.title)}</a>${e.period ? `<span class="mono">${esc(e.period)}</span>` : ''}</div>
    <blockquote>“${highlight(e.quote, e.matched)}”</blockquote>
    <p class="factors">proof ${f.proof.toFixed(2)} × recency ${f.recency.toFixed(2)} × specificity ${f.specificity.toFixed(2)} × relevance ${f.relevance.toFixed(2)} = <b>${e.e.toFixed(2)}</b></p>
    ${pub.length ? `<details class="ev-src"><summary>${pub.length === 1 ? 'Its public source' : `Its ${pub.length} public sources`}</summary><ul>${pub.map(s => `<li>
      <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a><span class="chk" data-check="${esc(s.repo || s.url)}">checking…</span><br>
      ${s.publisher ? `${esc(s.publisher)}${s.date ? `, ${esc(s.date)}` : ''}. ` : ''}<b>Proves:</b> ${esc(s.proves)}${s.doesnt ? ` <b>Doesn't prove:</b> ${esc(s.doesnt)}` : ''}${s.note ? ` ${esc(s.note)}` : ''}
    </li>`).join('')}</ul></details>` : '<p class="factors">No public source: from his resume only.</p>'}
  </li>`;
}

els.results.addEventListener('click', async e => {
  const head = e.target.closest('.req-head');
  if (head) {
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    head.nextElementSibling.hidden = open;
    return;
  }
  if (e.target.closest('[data-act="share"]')) {
    const url = shareUrl().href;
    try { await navigator.clipboard.writeText(url); toast('Link copied. It carries requirement ids, never the job description.'); } catch { prompt('Copy this link:', url); }
  }
});

/* ---------- live checks: re-verify every public source the score leans on ---------- */
let runId = 0;
async function liveChecks(rows) {
  const id = ++runId;
  const log = $('#liveLog'), sum = $('#liveSum'), box = $('#live');
  const targets = new Map();
  for (const m of rows) for (const e of m.evidence) for (const s of e.sources) if (s.kind !== 'self') targets.set(s.repo || s.url, s);
  if (!targets.size) { sum.textContent = 'Nothing here has a public source to check: every line is from his resume.'; box.classList.add('done'); return; }
  let ok = 0, n = 0, commits = 0;
  const mark = (key, cls, text) => $$(`[data-check="${CSS.escape(key)}"]`).forEach(x => { x.className = `chk ${cls}`; x.textContent = text; });
  const line = (cls, text) => { const li = document.createElement('li'); li.innerHTML = `<span class="${cls}">${cls === 'ok' ? '✓' : '!'}</span><span>${esc(text)}</span>`; log.append(li); };
  const list = [...targets.entries()];
  const work = async ([key, s]) => {
    let res;
    if (s.repo) {
      try { const g = await checkRepo(s.repo); res = { ok: true, text: `${s.repo} · public · ${g.commits} commits · last push ${fmtDay(g.pushed)}` }; commits += g.commits; }
      catch (err) { res = { ok: false, text: `${s.repo} · ${err.message} (snapshot: ${s.snapshot?.commits} commits on ${fmtDay(s.snapshot?.checked)})` }; }
    } else {
      const r = await checkReachable(s.url);
      res = { ok: r.ok, text: `${s.publisher || new URL(s.url).hostname.replace(/^www\./, '')} · ${r.ok ? `answered in ${r.ms} ms` : "didn't answer from your browser"}` };
    }
    if (id !== runId) return;
    n++; if (res.ok) ok++;
    mark(key, res.ok ? 'ok' : 'warn', res.ok ? (s.repo ? '✓ live on GitHub' : '✓ reachable now') : '! not reachable from here');
    line(res.ok ? 'ok' : 'warn', res.text);
    sum.textContent = `${ok} of ${targets.size} public sources answered just now${commits ? ` · ${commits} commits confirmed on GitHub` : ''}${n < targets.size ? '…' : '.'}`;
  };
  // four at a time, so the log fills steadily rather than all at once
  for (let i = 0; i < list.length; i += 4) { await Promise.all(list.slice(i, i + 4).map(work)); if (id !== runId) return; }
  box.classList.add('done');
}

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
function mailto(title) {
  const body = `Hi Parth,\n\n[a line about the role]\n\n(I ran your fit check: ${shareUrl().href})`;
  return `mailto:${data.profile.contact.email}?subject=${encodeURIComponent(`About ${title}`)}&body=${encodeURIComponent(body)}`;
}
let toastT;
function toast(msg) {
  $('.toast')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="toast" role="status">${esc(msg)}</div>`);
  clearTimeout(toastT);
  toastT = setTimeout(() => $('.toast')?.remove(), 2600);
}

/* ---------- restore a shared view ---------- */
const q = new URLSearchParams(location.search);
if (q.get('as') && PERSONAS[q.get('as')]) {
  const b = els.lenses.find(x => x.dataset.persona === q.get('as'));
  b?.setAttribute('aria-pressed', 'true');
  show(fitFor(data, '', { persona: q.get('as') }), { mode: 'persona', persona: q.get('as') }, { scroll: false });
} else if (q.get('k')) {
  const items = q.get('k').split(',').map(s => { const [id, w] = s.split('~'); return { id, w: (+w || 2) / 2 }; }).slice(0, 30);
  const title = (q.get('t') || '').slice(0, 90) || null;
  const fit = fitFromIds(data, items, title);
  if (fit.score != null) show(fit, { mode: 'link', title }, { scroll: false });
}
