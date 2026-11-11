// Prototype 2: the page is a payments machine. Everything below is a simulation that runs in the browser.
const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const C = { ink: '#0E0D0B', neon: '#00FF94', pink: '#FF2D78', gold: '#E6B547', dim: '#8F897A', paper: '#F3EFE4', pipe: '#26231D' };
function size(c) { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); c.width = r.width * d; c.height = r.height * d; const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { x, w: r.width, h: r.height }; }
const fmt = n => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`;

/* ---------- 1 · the rail ---------- */
const rail = $('#rail'); let R = size(rail), pts = [], len = [], total = 0;
const STOPS = ['ISSUE', 'AUTHORISE', 'FRAUD CHECK', 'MASTERCARD RAILS', 'SETTLE'];
function layout() {
  R = size(rail);
  const { w, h } = R, narrow = w < 700, y0 = h * (narrow ? 0.66 : 0.675), amp = h * (narrow ? 0.05 : 0.05), ctrl = [];
  ctrl.push([-40, y0 + amp]);
  STOPS.forEach((_, i) => ctrl.push([w * (0.08 + 0.84 * i / 4), y0 + (i % 2 ? -amp : amp)]));
  ctrl.push([w + 40, y0 - amp]);
  pts = []; // Catmull-Rom through the stops
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.04) { const t2 = t * t, t3 = t2 * t;
      pts.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  len = [0]; for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  total = len[len.length - 1];
  stops = STOPS.map((name, i) => { const c = ctrl[i + 1]; let best = 0, bd = 1e9; pts.forEach((p, k) => { const d = Math.hypot(p[0] - c[0], p[1] - c[1]); if (d < bd) { bd = d; best = k; } }); return { name, at: len[best] / total, x: c[0], y: c[1] }; });
}
let stops = [];
function at(u) { const d = u * total; let i = 1; while (i < len.length - 1 && len[i] < d) i++; const f = (d - len[i - 1]) / (len[i] - len[i - 1] || 1), a = pts[i - 1], b = pts[i]; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
const cards = [], stat = { issued: 0, ok: 0, no: 0, settled: 0 }, pulses = [];
function issue(mine = false) {
  cards.push({ u: 0, v: (mine ? 0.16 : 0.09 + Math.random() * 0.05), mine, amt: 200 + Math.random() * 8800, bad: !mine && Math.random() < 0.13, checked: false, fall: null, trail: [] });
  stat.issued++; if (mine) { $('#nudge').style.opacity = 0; pulses.push({ i: 0, t: 0 }); }
}
function drawRail(dt) {
  const { x, w, h } = R; x.clearRect(0, 0, w, h);
  x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]));
  x.strokeStyle = C.pipe; x.lineWidth = w < 700 ? 22 : 34; x.stroke();
  x.strokeStyle = 'rgba(0,255,148,0.22)'; x.lineWidth = 1.5; x.setLineDash([2, 10]); x.lineDashOffset = -performance.now() / 40; x.stroke(); x.setLineDash([]);
  for (const s of stops) {
    const p = pulses.filter(q => stops[q.i] === s).reduce((m, q) => Math.max(m, 1 - q.t), 0);
    x.fillStyle = C.ink; x.strokeStyle = p ? C.neon : '#4a463c'; x.lineWidth = 2 + p * 3;
    x.beginPath(); x.arc(s.x, s.y, (w < 700 ? 15 : 22) + p * 8, 0, 7); x.fill(); x.stroke();
    x.fillStyle = p ? C.neon : C.dim; x.font = `600 ${w < 700 ? 8 : 10}px "Martian Mono", monospace`; x.textAlign = 'center';
    const up = s.y < h * (w < 700 ? 0.66 : 0.675); x.fillText(w < 700 ? s.name.split(' ')[0] : s.name, s.x, s.y + (up ? -34 : 44));
  }
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.fall) { c.fall.vy += 900 * dt; c.fall.x += c.fall.vx * dt; c.fall.y += c.fall.vy * dt; c.fall.r += 6 * dt; if (c.fall.y > h + 40) { cards.splice(i, 1); continue; } }
    else {
      c.u += c.v * dt;
      if (!c.checked && c.u >= stops[2].at) { c.checked = true; if (c.bad) { const p = at(c.u); c.fall = { x: p.x, y: p.y, vx: 60, vy: -160, r: p.ang }; stat.no++; } }
      if (c.mine) for (let k = 0; k < stops.length; k++) if (!c['s' + k] && c.u >= stops[k].at) { c['s' + k] = 1; pulses.push({ i: k, t: 0 }); }
      if (c.u >= stops[4].at && !c.done) { c.done = true; stat.ok++; stat.settled += c.amt * (c.mine ? 40 : 1); }
      if (c.u >= 1) { cards.splice(i, 1); continue; }
    }
    const p = c.fall ? { x: c.fall.x, y: c.fall.y, ang: c.fall.r } : at(c.u), s = c.mine ? 2.1 : 1, cw = 20 * s, ch = 13 * s;
    if (c.mine && !c.fall) { c.trail.push([p.x, p.y]); if (c.trail.length > 26) c.trail.shift(); x.beginPath(); c.trail.forEach((t, k) => k ? x.lineTo(t[0], t[1]) : x.moveTo(t[0], t[1])); x.strokeStyle = 'rgba(0,255,148,0.5)'; x.lineWidth = 6; x.stroke(); }
    x.save(); x.translate(p.x, p.y); x.rotate(p.ang);
    x.fillStyle = c.fall ? C.pink : c.mine ? C.neon : c.done ? C.gold : C.paper; if (c.mine) { x.shadowColor = C.neon; x.shadowBlur = 24; }
    x.beginPath(); x.roundRect(-cw / 2, -ch / 2, cw, ch, 2.5 * s); x.fill(); x.shadowBlur = 0;
    x.fillStyle = C.ink; x.fillRect(-cw / 2 + 3 * s, -ch / 2 + 3 * s, 4.5 * s, 3.5 * s); x.fillRect(-cw / 2 + 3 * s, ch / 2 - 4 * s, cw - 6 * s, 1.2 * s);
    x.restore();
  }
  for (let i = pulses.length - 1; i >= 0; i--) { pulses[i].t += dt * 1.6; if (pulses[i].t >= 1) pulses.splice(i, 1); }
  $('#mIssued').textContent = stat.issued; $('#mOk').textContent = stat.ok; $('#mNo').textContent = stat.no; $('#mSettled').textContent = fmt(stat.settled);
}
layout(); addEventListener('resize', () => { layout(); sizeLanes(); });
$('#issue').addEventListener('click', () => issue(true));
rail.addEventListener('click', () => issue(true));
addEventListener('keydown', e => { if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); issue(true); } });

/* ---------- 2 · the fraud desk ---------- */
const lanes = $('#lanes'); let L = size(lanes); const sizeLanes = () => { L = size(lanes); };
const tx = [], desk = { paid: 0, fraud: 0, fp: 0, caught: 0 }, feed = $('#feed');
const NAMES = ['St Mary Clinic', 'Lakeview Dental', 'Dr Okafor', 'Peak Ortho', 'Harbor Imaging', 'Sunrise Peds', 'Northside Lab', 'Cedar Pharmacy', 'QuickCash LLC', 'Unit 4B Trading', 'Dr Patel', 'Valley Physio'];
function spawn() {
  const fraud = Math.random() < 0.16, risk = Math.round(fraud ? 45 + Math.random() * 54 : Math.random() ** 1.7 * 78), amt = Math.round(fraud ? 8 + Math.random() * 90 : 1 + Math.random() ** 2 * 70);
  tx.push({ x: -10, y: 30 + Math.random() * (L.h - 190), fraud, risk, amt, name: NAMES[fraud && Math.random() < 0.5 ? 8 + (Math.random() * 2 | 0) : Math.random() * NAMES.length | 0], v: 110 + Math.random() * 60, st: null, vy: 0 });
}
function decide(t) {
  const block = t.risk > +$('#risk').value || t.amt > +$('#amt').value;
  t.st = block ? (t.fraud ? 'caught' : 'fp') : (t.fraud ? 'fraud' : 'paid'); desk[t.st]++;
  const cls = { paid: 'ok', fraud: 'no', fp: 'fp', caught: '' }[t.st], word = { paid: 'PAID', fraud: 'FRAUD GOT THROUGH', fp: 'REAL PAYMENT BLOCKED', caught: 'fraud blocked' }[t.st];
  feed.insertAdjacentHTML('beforeend', `<li class="${cls}"><span>${t.name} · $${t.amt}K · risk ${t.risk}</span><span>${word}</span></li>`);
  while (feed.children.length > 5) feed.firstChild.remove();
  $('#sPaid').textContent = desk.paid; $('#sFraud').textContent = desk.fraud; $('#sFalse').textContent = desk.fp;
  const n = desk.paid + desk.fraud + desk.fp + desk.caught;
  if (n > 14) { const fr = desk.fraud / n, fp = desk.fp / n;
    $('#verdict').textContent = fr > 0.05 ? 'Too loose. Fraud is walking out the door.' : fp > 0.12 ? 'Too tight. Real doctors are not getting paid, and they will call.' : 'That is the job: catch the fraud, pay everyone else. Now do it across 9 functional areas.'; }
}
function drawLanes(dt) {
  const { x, w, h } = L; x.clearRect(0, 0, w, h); const gate = w * 0.58;
  x.strokeStyle = 'rgba(243,239,228,0.06)'; x.lineWidth = 1; for (let y = 40; y < h - 150; y += 34) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); }
  x.strokeStyle = C.neon; x.lineWidth = 3; x.shadowColor = C.neon; x.shadowBlur = 14; x.beginPath(); x.moveTo(gate, 14); x.lineTo(gate, h - 150); x.stroke(); x.shadowBlur = 0;
  x.fillStyle = C.neon; x.font = '600 10px "Martian Mono", monospace'; x.textAlign = 'center'; x.fillText('YOUR RULES', gate, h - 132);
  for (let i = tx.length - 1; i >= 0; i--) { const t = tx[i];
    if (t.st === 'fp' || t.st === 'caught') { t.vy += 700 * dt; t.y += t.vy * dt; t.x += 20 * dt; } else t.x += t.v * dt;
    if (!t.st && t.x >= gate) decide(t);
    if (t.x > w + 20 || t.y > h + 20) { tx.splice(i, 1); continue; }
    const r = 4 + Math.sqrt(t.amt) * 1.25;
    x.fillStyle = t.st === 'paid' ? C.neon : t.st === 'fraud' ? C.pink : t.st === 'fp' ? C.gold : t.st === 'caught' ? '#4a463c' : `rgb(${150 + t.risk},${200 - t.risk * 1.3},${190 - t.risk * 1.1})`;
    if (t.st === 'fraud') { x.shadowColor = C.pink; x.shadowBlur = 18; }
    x.beginPath(); x.arc(t.x, t.y, r, 0, 7); x.fill(); x.shadowBlur = 0;
  }
}
for (const [id, out, f] of [['risk', 'riskV', v => v], ['amt', 'amtV', v => `$${v},000`]]) $('#' + id).addEventListener('input', e => { $('#' + out).textContent = f(e.target.value); });
$('#reset').addEventListener('click', () => { Object.keys(desk).forEach(k => desk[k] = 0); feed.innerHTML = ''; ['sPaid', 'sFraud', 'sFalse'].forEach(i => $('#' + i).textContent = 0); $('#verdict').textContent = 'Running…'; });
const flip = $('#flip'), turn = $('#turn');
turn.addEventListener('click', () => { const on = flip.classList.toggle('turned'); turn.setAttribute('aria-pressed', on); turn.textContent = on ? 'Back to the number ↻' : 'What the real one did ↻'; flip.querySelector('.front').setAttribute('aria-hidden', on); flip.querySelector('.back').setAttribute('aria-hidden', !on); });

/* ---------- loop ---------- */
let last = performance.now(), tA = 0, tB = 0, deskOn = false;
new IntersectionObserver(([e]) => { deskOn = e.isIntersecting; }).observe(lanes);
document.fonts?.ready.then(layout);
(function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!document.hidden) {
    tA += dt; if (tA > (reduce ? 1.6 : 0.55)) { tA = 0; issue(); }
    drawRail(dt);
    if (deskOn) { tB += dt; if (tB > 0.42) { tB = 0; spawn(); } drawLanes(dt); }
  }
  requestAnimationFrame(loop);
})(last);
