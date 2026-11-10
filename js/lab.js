// PROOF - design prototype (lab/). Everything here reads the same record as the live site.
// The line patterns are generated: each one is seeded by the work it decorates, so no two are alike.

import { fitFor } from './career-engine.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let uv = false;

/* ---------- pattern generator ---------- */
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s ^= s >>> 16) >>> 0) / 4294967296); }
function fit2d(c) {
  const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d));
  const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
  return { x, w: r.width, h: r.height };
}
// one woven ring: `curves` closed lines whose phase steps through a full turn
function ring(x, cx, cy, R, o, upto = 1) {
  x.lineWidth = o.lw || 0.6; x.strokeStyle = o.color;
  const n = Math.ceil(o.curves * upto);
  for (let k = 0; k < n; k++) {
    const off = k / o.curves * Math.PI * 2;
    x.beginPath();
    for (let i = 0; i <= 480; i++) {
      const t = i / 480 * Math.PI * 2;
      const r = R * (1 - o.a - o.b + o.a * Math.sin(o.n * t + off + (o.phase || 0)) + o.b * Math.sin(o.m * t - off * 2));
      const px = cx + r * Math.cos(t), py = cy + r * Math.sin(t);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.stroke();
  }
}
const INK = () => (uv
  ? ['rgba(0,255,148,0.75)', 'rgba(255,45,120,0.75)', 'rgba(255,225,77,0.75)']
  : ['rgba(0,168,112,0.55)', 'rgba(255,45,120,0.5)', 'rgba(21,19,15,0.5)']);
function paramsFor(seed) {
  const r = rng(hash(seed));
  const pick = (a, b) => a + Math.floor(r() * (b - a + 1));
  return [
    { curves: 22, n: pick(12, 20), m: pick(4, 7), a: 0.09, b: 0.04, s: 1 },
    { curves: 18, n: pick(8, 13), m: pick(3, 5), a: 0.1, b: 0.05, s: 0.74 },
    { curves: 14, n: pick(5, 9), m: pick(2, 4), a: 0.1, b: 0.04, s: 0.5 },
  ];
}
const rosettes = $$('[data-ros]').map(el => {
  const p = paramsFor(el.dataset.ros);
  if (el.hasAttribute('data-label')) el.dataset.params = `pattern  n${p[0].n} · m${p[0].m} · n${p[1].n} · m${p[1].m}  seeded by "${el.dataset.ros.split('·')[0]}"`;
  return { el, c: $('canvas', el), p, t: reduceMotion ? 1 : 0, phase: 0 };
});
function drawRos(R) {
  const { x, w, h } = fit2d(R.c);
  x.clearRect(0, 0, w, h);
  if (w < 8) return;
  const ink = INK(), rad = Math.min(w, h) / 2 - 2;
  R.p.forEach((o, i) => ring(x, w / 2, h / 2, rad * o.s, { ...o, color: ink[i], phase: R.phase * (i % 2 ? -1.3 : 1) }, R.t));
}
function drawField(c) {
  const { x, w, h } = fit2d(c);
  x.clearRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, w, 0);
  if (uv) { g.addColorStop(0, 'rgba(126,100,230,0.26)'); g.addColorStop(1, 'rgba(126,100,230,0.1)'); }
  else { g.addColorStop(0, 'rgba(0,168,112,0.34)'); g.addColorStop(0.55, 'rgba(168,130,42,0.26)'); g.addColorStop(1, 'rgba(255,45,120,0.3)'); }
  x.strokeStyle = g; x.lineWidth = 0.6;
  for (let y = -10; y < h + 10; y += 5) {
    x.beginPath();
    for (let px = 0; px <= w; px += 6) { const yy = y + 4 * Math.sin(px / 38 + y / 27) + 2.2 * Math.sin(px / 11 - y / 40); px ? x.lineTo(px, yy) : x.moveTo(px, yy); }
    x.stroke();
  }
}
function drawFibres() {
  const { x, w, h } = fit2d($('#fibres'));
  x.clearRect(0, 0, w, h);
  const r = rng(7), cols = ['#00FF94', '#FF2D78', '#FFE14D', '#6FA8FF'];
  for (let i = 0; i < Math.round(w * h / 9000); i++) {
    const fx = r() * w, fy = r() * h, a = r() * Math.PI, col = cols[i % 4];
    x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 6; x.lineWidth = 1.1;
    x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + 6 * Math.cos(a + 1), fy + 6 * Math.sin(a + 1), fx + 11 * Math.cos(a), fy + 11 * Math.sin(a)); x.stroke();
  }
}
function drawAll() { $$('[data-field]').forEach(drawField); rosettes.forEach(drawRos); if (uv) drawFibres(); }

// microtext is real text: zoom in and read it
const MICRO = '0 P1/P2 DEFECTS · 150K+ CARDS ISSUED · 90 DAYS OFF ONBOARDING · ~80% FASTER CONNECTOR BUILDS · 1,200+ ATTRIBUTES GOVERNED · 12+ CONNECTORS LIVE · ';
$$('[data-micro]').forEach(el => { el.textContent = (el.dataset.micro || MICRO).repeat(8); });

drawAll();
document.fonts?.ready.then(drawAll);
let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawAll, 120); });

// the patterns plot themselves once, when first seen; the hero one then turns slowly
const seen = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const R = rosettes.find(r => r.el === e.target);
  seen.unobserve(e.target);
  if (reduceMotion) return;
  const t0 = performance.now();
  (function grow(now) { R.t = Math.min(1, (now - t0) / 1400); drawRos(R); if (R.t < 1) requestAnimationFrame(grow); })(t0);
}), { threshold: 0.3 });
rosettes.forEach(R => seen.observe(R.el));
if (!reduceMotion) {
  const hero = rosettes.find(r => r.el.dataset.size === 'hero');
  let last = 0, vis = true;
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(hero.el);
  (function turn(ts) { if (vis && hero.t >= 1 && ts - last > 70) { last = ts; hero.phase += 0.012; drawRos(hero); } requestAnimationFrame(turn); })(0);
}

/* ---------- the lamp ---------- */
const uvBtn = $('#uvBtn');
uvBtn.addEventListener('click', () => {
  uv = !uv;
  document.body.classList.toggle('uv', uv);
  uvBtn.setAttribute('aria-pressed', String(uv));
  $('meta[name="theme-color"]').content = uv ? '#0B0620' : '#F3EFE4';
  drawAll();
});

/* ---------- the note turns over ---------- */
const flip = $('#flip'), turn = $('#turn');
turn.addEventListener('click', () => {
  const on = flip.classList.toggle('turned');
  turn.setAttribute('aria-pressed', String(on));
  $('#turnL').textContent = on ? 'Back to the front' : 'Turn it over';
  $('.front', flip).setAttribute('aria-hidden', String(on));
  $('.back', flip).setAttribute('aria-hidden', String(!on));
});

/* ---------- the record ---------- */
let data;
try {
  const res = await fetch(new URL('../data/career.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  data = await res.json();
} catch {
  $('#detail').textContent = 'The record did not load. Reload the page.';
  throw new Error('career.json failed to load');
}

/* ---------- stamps ---------- */
const P = (d) => `<svg viewBox="0 0 48 32" aria-hidden="true">${d}</svg>`;
const LOOK = {
  track: { c: '#00A870', v: '8,677', u: 'stations', ic: P('<path d="M3 24h42M8 24v-9h14v9M26 24v-12h16v12"/><circle cx="12" cy="27" r="2"/><circle cx="34" cy="27" r="2"/><path d="M12 19h6M30 16h8"/>') },
  chalk: { c: '#15130F', v: '81', u: 'tests', f: '#00FF94', ic: P('<rect x="4" y="5" width="40" height="22" rx="3"/><circle cx="15" cy="16" r="3"/><circle cx="27" cy="12" r="2"/><circle cx="31" cy="20" r="2"/><path d="M18 16l7-3"/>') },
  shelfie: { c: '#FF2D78', v: '30', u: 'sounds', ic: P('<path d="M6 27V7h7v20M13 27V10h6v17M19 27V5h8v22M30 27l-4-19 6-1 5 19zM3 27h42"/>') },
  credit: { c: '#2B50D8', v: '22', u: 'chapters', ic: P('<rect x="5" y="6" width="38" height="21" rx="3"/><path d="M5 13h38M10 21h9"/><rect x="31" y="18" width="7" height="5" rx="1"/>') },
  ai: { c: '#7A3FF2', v: '22', u: 'phases', ic: P('<circle cx="8" cy="16" r="3"/><circle cx="24" cy="7" r="3"/><circle cx="24" cy="25" r="3"/><circle cx="40" cy="16" r="3"/><path d="M11 15l10-6M11 17l10 6M27 8l10 6M27 24l10-6M24 10v12"/>') },
  jira: { c: '#E6B547', v: '3', u: 'surfaces', f: '#15130F', ic: P('<rect x="5" y="5" width="11" height="22" rx="1.5"/><rect x="18.5" y="5" width="11" height="15" rx="1.5"/><rect x="32" y="5" width="11" height="9" rx="1.5"/>') },
  grid: { c: '#D7261E', v: '22', u: 'tracks', ic: P('<path d="M8 22c-4-6 2-14 9-11l9 4c5 2 8-6 14-4 5 2 4 10-1 12-6 2-9-3-15-2-6 2-11 6-16 1z"/><path d="M22 9v6"/>') },
  cookbook: { c: '#E8632B', v: '216', u: 'cards', ic: P('<path d="M6 17h36a18 14 0 0 1-36 0zM14 12c-2-3 2-4 0-7M24 12c-2-3 2-4 0-7M34 12c-2-3 2-4 0-7"/>') },
  posters: { c: '#0F6E8C', v: '96', u: 'circuits', ic: P('<rect x="9" y="3" width="30" height="26"/><path d="M13 22l8-9 5 5 4-6 5 10M13 11h6M30 9h5M17 25h14"/>') },
};
const stampsEl = $('#stamps'), detail = $('#detail');
const projects = data.projects.filter(p => LOOK[p.id]);
stampsEl.innerHTML = projects.map((p, i) => {
  const L = LOOK[p.id];
  return `<button type="button" class="stamp" role="tab" aria-selected="false" data-id="${p.id}" style="--c:${L.c};${L.f ? `--f:${L.f}` : ''}">
    <span class="st-in"><span class="st-k"><span>Parth</span><span>${String(i + 1).padStart(2, '0')}</span></span><span class="st-ic">${L.ic}</span><span class="st-v">${L.v}</span><span class="st-n">${esc(p.name)}</span></span>
  </button>`;
}).join('');
function showProject(id, animate = true) {
  const p = projects.find(x => x.id === id), L = LOOK[id];
  $$('.stamp', stampsEl).forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id)));
  detail.innerHTML = `
    <svg class="postmark" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="pmc" d="M50 50m-36 0a36 36 0 1 1 72 0a36 36 0 1 1-72 0"/></defs>
      <circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="27"/><text><textPath href="#pmc">HYDERABAD · SHIPPED · LIVE · PARTH8 · </textPath></text>
      <text x="50" y="48" class="pm-d">${esc((p.updated || '').split(' ')[0] || 'LIVE').toUpperCase()}</text><text x="50" y="61" class="pm-d">${esc((p.updated || '').split(' ')[1] || '')}</text>
      <path d="M2 38q8-5 16 0M2 50q8-5 16 0M2 62q8-5 16 0"/></svg>
    <h3>${esc(p.name)}</h3>
    <p class="d-tag">${esc(p.tagline)}</p>
    ${p.based_on ? `<p class="d-fork">${esc(p.based_on)}</p>` : ''}
    <ul>${p.evidence.slice(0, 3).map(e => `<li>${esc(e)}</li>`).join('')}</ul>
    <div class="d-links"><a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">Open it ↗</a>${p.repo ? `<a class="btn ghost" href="${esc(p.repo)}" target="_blank" rel="noopener">Code</a>` : ''}</div>`;
  if (animate && !reduceMotion) { detail.classList.remove('in'); void detail.offsetWidth; detail.classList.add('in'); }
}
stampsEl.addEventListener('click', e => { const b = e.target.closest('.stamp'); if (b) showProject(b.dataset.id); });
showProject(projects[0].id, false);

/* ---------- the terminal ---------- */
const JOBS = [
  { key: 'F1', label: 'Card-issuing PM', jd: 'Senior Product Manager, Card Issuing. Own our card issuing platform: virtual and physical cards, processor integrations and the APIs our enterprise clients build on. Work with compliance and risk to launch card programs in the US and Europe. 5+ years in fintech or payments; card networks (Visa, Mastercard), chargebacks and disputes, fraud controls, KYC and PCI DSS; webhooks; go-to-market with sales; SQL and dashboards.' },
  { key: 'F2', label: 'AI platform PM', jd: 'Product Manager, AI Platform (Forward Deployed). Own the platform that lets enterprise customers build agents on our APIs: tools over MCP, retrieval (RAG) and evaluation pipelines, and the call between open-weight and hosted models on cost, latency and accuracy. 4+ years on developer or platform products; hands-on with LLMs, prompt engineering, evals and guardrails; technical enough to prototype; regulated industries a plus.' },
  { key: 'F3', label: 'Growth director', jd: 'Director of Product, Consumer Growth. Lead and manage a team of 6 product managers across activation, retention and monetisation for our consumer app on iOS and Android. Own experimentation: A/B testing, funnels, growth loops. 10+ years of product experience, including 4+ years managing product managers.' },
];
const VERDICT = { Excellent: ['Approved', 'ok', '00'], Strong: ['Approved', 'ok', '00'], Fair: ['Refer to issuer', 'mid', '01'], Stretch: ['Declined', 'no', '05'] };
const jobsEl = $('#jobs'), slip = $('#slip');
jobsEl.innerHTML = JOBS.map((j, i) => `<button type="button" class="key" aria-pressed="false" data-i="${i}">${esc(j.label)} <span>${j.key}</span></button>`).join('');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let run = 0;
async function runJob(i) {
  const me = ++run, j = JOBS[i];
  $$('.key', jobsEl).forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  $('#termRole').textContent = j.label;
  $('#termStatus').textContent = 'Authorising…';
  if (!reduceMotion) await sleep(550);
  if (me !== run) return;
  const f = fitFor(data, j.jd);
  const [word, tone, code] = VERDICT[f.band] || VERDICT.Stretch;
  $('#termStatus').textContent = `${code} · ${word}`;
  const rows = [...f.matches, ...f.gaps.filter(g => !f.matches.some(m => m.id === g.id))].slice(0, 10);
  const hard = f.notes.find(n => /^Hard gap/i.test(n));
  slip.innerHTML = `
    <div class="sl-h"><span>Fit check · authorisation</span><span>${new Date().toISOString().slice(0, 10)}</span></div>
    <p class="sl-v ${tone}">${word}</p>
    <div class="sl-score"><b>${f.score}</b><span>/ 100 · ${esc(f.band)} · response ${code}</span></div>
    <p class="sl-why">${hard ? esc(hard) : `${f.coverage.evidenced} of ${f.coverage.total} requirements have solid evidence on his record.`}</p>
    <hr class="sl-rule">
    ${rows.map(m => { const c = m.confidence ?? 0, on = Math.round(c * 10); return `<div class="sl-row${c < 0.4 ? ' low' : ''}"><span>${esc(m.label)}</span><span class="seg">${Array.from({ length: 10 }, (_, k) => `<i${k < on ? ' class="on"' : ''}></i>`).join('')}</span><b>${c.toFixed(2)}</b></div>`; }).join('')}
    <hr class="sl-rule">
    <div class="sl-f"><span>Auth code</span><b>${f.credit}</b></div>
    <div class="sl-f"><span>Declined lines</span><b>${f.gaps.length || 'none'}</b></div>
    <div class="sl-f"><span>Method</span><b>arithmetic, no model</b></div>
    <div class="bc" aria-hidden="true"></div>`;
  if (!reduceMotion) { slip.classList.remove('print'); void slip.offsetWidth; slip.classList.add('print'); }
}
jobsEl.addEventListener('click', e => { const b = e.target.closest('.key'); if (b) runJob(+b.dataset.i); });
addEventListener('keydown', e => { const i = ['F1', 'F2', 'F3'].indexOf(e.key); if (i >= 0) { e.preventDefault(); runJob(i); } });
runJob(0);
