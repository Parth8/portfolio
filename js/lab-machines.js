// Prototype 2: the other machines. One small engine: each scene is a canvas that only runs while it is on screen,
// a rule the visitor sets, and a live score. Everything here is a toy model of a real decision.
const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = (window.labTally ||= {});
const MONO = '"Martian Mono", ui-monospace, monospace';

function canvas(c) {
  const st = { x: null, w: 0, h: 0 };
  const fit = () => { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); c.width = Math.max(1, r.width * d); c.height = Math.max(1, r.height * d); st.x = c.getContext('2d'); st.x.setTransform(d, 0, 0, d, 0, 0); st.w = r.width; st.h = r.height; };
  fit(); addEventListener('resize', fit); document.fonts?.ready.then(fit);
  return st;
}
function whenVisible(el, step) {
  let on = false, last = 0;
  const tick = now => { if (!on) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!document.hidden) step(dt, now); requestAnimationFrame(tick); };
  new IntersectionObserver(([e]) => { const was = on; on = e.isIntersecting; if (on && !was) { last = performance.now(); requestAnimationFrame(tick); } }, { threshold: 0.05 }).observe(el);
}
const money = n => n >= 1e3 ? `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : `$${Math.round(n)}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* every "what the real one did" card turns over */
document.querySelectorAll('[data-turn]').forEach(btn => {
  const flip = btn.previousElementSibling;
  btn.addEventListener('click', () => {
    const on = flip.classList.toggle('turned');
    btn.setAttribute('aria-pressed', on);
    btn.textContent = on ? 'Back to the number ↻' : 'What the real one did ↻';
    flip.querySelector('.front').setAttribute('aria-hidden', on);
    flip.querySelector('.back').setAttribute('aria-hidden', !on);
  });
});

/* ================= Connector Studio: map a bank's fields onto BIAN ================= */
{
  const V = ['acct_no', 'avail_bal', 'ledger_bal', 'ccy_cd', 'txn_dt', 'txn_amt', 'cust_nm', 'iban_no', 'stat_cd', 'brn_id'];
  const B = ['accountIdentification', 'availableBalance', 'ledgerBalance', 'currency', 'transactionDate', 'transactionAmount', 'customerName', 'iban', 'status', 'branchReference'];
  const SHORT = ['accountId', 'availBalance', 'ledgerBalance', 'currency', 'txnDate', 'txnAmount', 'customerName', 'iban', 'status', 'branchRef'];
  const SLOT = [3, 0, 6, 9, 1, 4, 8, 2, 5, 7];             // where each BIAN field sits in the right-hand column
  const MIX = [7, 2, 1, 5, 8, 1, 9, 0, 3, 6];              // the plausible wrong answer for each field
  const BAD = { 1: "customers see their ledger balance as money they can spend", 2: "available balance is reported as the ledger balance", 0: "payments post to the IBAN field", 7: "IBANs land in the account number", 5: "amounts are read as currency codes", 3: "currency codes are read as amounts", 4: "dates land in the status field", 8: "status codes become dates", 6: "names land in the branch field", 9: "branch codes become customer names" };
  const cv = canvas($('#csCanvas'));
  let acc = 0.55, maps = [], cursor = -1, t = 0, days = 0, shipped = null;
  const ui = { acc: $('#csAcc'), bar: $('#csBar'), days: $('#csDays'), v: $('#csVerdict'), gate: $('#csGate'), sec: $('#m-connector') };
  const show = () => {
    ui.acc.textContent = `${Math.round(acc * 100)}%`; ui.bar.style.width = `${acc * 100}%`; ui.bar.style.background = acc >= 0.9 ? 'var(--acc)' : acc >= 0.75 ? '#C99A1E' : 'var(--pink)';
    ui.days.textContent = `${days.toFixed(1)} days`;
  };
  $('#csRun').addEventListener('click', () => {
    maps = V.map((_, i) => { const ok = Math.random() < acc; return { to: ok ? i : MIX[i], ok, fixed: false, p: 0 }; });
    if (maps.every(m => m.ok) && acc < 0.9) { const k = Math.random() * 10 | 0; maps[k] = { to: MIX[k], ok: false, fixed: false, p: 0 }; }
    cursor = 0; t = 0; days += 0.6; shipped = null; ui.sec.classList.remove('incident');
    ui.v.textContent = 'The agent is mapping…'; show();
  });
  $('#csGold').addEventListener('click', () => {
    if (!maps.length) { ui.v.textContent = 'Run the agent first: there is nothing to review yet.'; return; }
    const wrong = maps.filter(m => !m.ok);
    wrong.forEach(m => { m.ok = true; m.fixed = true; m.p = 0; });
    maps.forEach((m, i) => { if (m.fixed) m.to = i; });
    days += 0.3 + 0.15 * wrong.length; acc = Math.min(0.95, acc + 0.1);
    ui.v.textContent = wrong.length ? `Fixed ${wrong.length} wrong mapping${wrong.length > 1 ? 's' : ''} by hand and added them to the golden dataset. The agent gets better at the next bank.` : 'Nothing wrong this run. The golden dataset still grows.';
    if (cursor < 0 || cursor >= maps.length) cursor = maps.length; show();
  });
  $('#csShip').addEventListener('click', () => {
    if (!maps.length) { ui.v.textContent = 'Nothing to ship yet. Run the agent.'; return; }
    if (ui.gate.checked && acc < 0.9) { ui.v.textContent = `Held in pre-prod. Accuracy is ${Math.round(acc * 100)}%, under the 90% gate. Slower adoption, no bad balances.`; return; }
    const wrong = maps.findIndex(m => !m.ok);
    if (wrong >= 0) {
      shipped = 'bad'; ui.sec.classList.remove('incident'); void ui.sec.offsetWidth; ui.sec.classList.add('incident');
      ui.v.textContent = `Incident: ${BAD[wrong]}. A real bank's customers just saw it.${acc >= 0.9 ? ` Even at ${Math.round(acc * 100)}%, one line in ten can be wrong: every build still gets a human review.` : ''}`; T.cs = { result: 'incident', days };
    } else {
      shipped = 'ok'; ui.v.textContent = `Shipped in ${days.toFixed(1)} days, against about 12 by hand. Every mapping checked.`; T.cs = { result: 'shipped', days };
    }
    show();
  });
  show();
  const rows = (h, n) => Array.from({ length: n }, (_, i) => 40 + (h - 80) * (i + 0.5) / n);
  function draw(dt) {
    const { x, w, h } = cv; if (!x) return; x.clearRect(0, 0, w, h);
    const narrow = w < 560, lx = narrow ? 12 : 24, rx = narrow ? w - 12 : w - 24, cw = narrow ? 92 : 150, ys = rows(h, 10);
    x.font = `600 ${narrow ? 8 : 10}px ${MONO}`; x.textBaseline = 'middle';
    x.fillStyle = '#4A5E6B'; x.textAlign = 'left'; x.fillText("THE BANK'S CORE", lx, 20); x.textAlign = 'right'; x.fillText('BIAN UNIFIED API', rx, 20);
    if (cursor >= 0 && cursor < maps.length) { t += dt * (reduce ? 20 : 3.2); if (t >= 1) { maps[cursor].p = 1; cursor++; t = 0; } else maps[cursor].p = t; }
    maps.forEach((m, i) => {
      if (!m.p) return; const y1 = ys[i], y2 = ys[SLOT[m.to]], x1 = lx + cw, x2 = rx - (narrow ? 118 : 182);
      const col = m.fixed ? '#C99A1E' : m.ok ? '#007A52' : '#FF2D78';
      x.strokeStyle = col; x.lineWidth = m.ok ? 2 : 2.4; x.setLineDash(m.ok ? [] : [6, 5]);
      x.beginPath(); const steps = 40;
      for (let k = 0; k <= steps * m.p; k++) { const u = k / steps, bx = x1 + (x2 - x1) * u, by = y1 + (y2 - y1) * (3 * u * u - 2 * u * u * u); k ? x.lineTo(bx, by) : x.moveTo(bx, by); }
      x.stroke(); x.setLineDash([]);
      if (m.p < 1) { const u = m.p, bx = x1 + (x2 - x1) * u, by = y1 + (y2 - y1) * (3 * u * u - 2 * u * u * u); x.fillStyle = '#00FF94'; x.shadowColor = '#00FF94'; x.shadowBlur = 16; x.beginPath(); x.arc(bx, by, 5, 0, 7); x.fill(); x.shadowBlur = 0; }
      else if (!m.ok) { x.fillStyle = '#FF2D78'; x.textAlign = 'center'; x.fillText('✕', (x1 + x2) / 2, (y1 + y2) / 2 - 8); }
    });
    const chip = (label, cx, y, wdt, align, on, bad) => {
      x.fillStyle = bad ? '#FFE3EC' : on ? '#FFFFFF' : '#F2F6F7'; x.strokeStyle = bad ? '#FF2D78' : '#0E2233'; x.lineWidth = 1.2;
      const left = align === 'left' ? cx : cx - wdt; x.beginPath(); x.roundRect(left, y - 12, wdt, 24, 4); x.fill(); x.stroke();
      x.fillStyle = '#0E2233'; x.textAlign = 'left'; x.fillText(label, left + 8, y + 0.5);
    };
    V.forEach((v, i) => chip(v, lx, ys[i], cw, 'left', maps[i]?.p === 1, maps[i]?.p === 1 && !maps[i].ok));
    B.forEach((b, i) => { const lab = narrow ? SHORT[i] : b; chip(lab, rx, ys[SLOT[i]], narrow ? 118 : 182, 'right', maps.some(m => m.p === 1 && m.to === i), false); });
    if (shipped) {
      x.save(); x.translate(w / 2, h / 2); x.rotate(-0.12); x.font = `900 ${narrow ? 30 : 46}px "Big Shoulders Display", Impact, sans-serif`; x.textAlign = 'center';
      x.strokeStyle = x.fillStyle = shipped === 'ok' ? '#007A52' : '#FF2D78'; x.lineWidth = 4;
      const word = shipped === 'ok' ? 'SHIPPED · ALL CHECKED' : 'PRODUCTION INCIDENT', tw = x.measureText(word).width + 30;
      x.globalAlpha = 0.92; x.fillStyle = '#F2F6F7'; x.fillRect(-tw / 2, -32, tw, 64); x.strokeRect(-tw / 2, -32, tw, 64); x.fillStyle = x.strokeStyle; x.fillText(word, 0, 3); x.restore();
    }
    if (!maps.length) { x.fillStyle = '#4A5E6B'; x.textAlign = 'center'; x.font = `400 ${narrow ? 11 : 13}px ${MONO}`; x.fillText('ten fields, no mappings yet', w / 2, h / 2); }
  }
  whenVisible($('#m-connector'), dt => draw(dt));
}

/* ================= Data Platform SaaS: onboard banks by config, pay for freshness ================= */
{
  const BANKS = [
    { name: 'US card issuer', ask: 'Wants real-time data on everything.', fresh: 2, col: '#E6B547' },
    { name: 'UK lender', ask: 'Wants its own schema and a feed built just for them.', fresh: 1, col: '#4FD1A5' },
    { name: 'EMEA neobank', ask: 'Needs daily extracts for its finance team.', fresh: 0, col: '#8FB8FF' },
    { name: 'US credit union', ask: 'Wants a bespoke dashboard build.', fresh: 2, col: '#FF7AA6' },
  ];
  const FRESH = [{ k: 'Daily batch', cost: 1200, every: 4.2, n: 22, v: 80 }, { k: 'Hourly', cost: 3500, every: 1.1, n: 7, v: 130 }, { k: 'Real-time', cost: 9000, every: 0.06, n: 1, v: 230 }];
  const STAGES = ['INGEST', 'BRONZE', 'SILVER', 'GOLD', 'EXTRACTS'];
  const cv = canvas($('#dpCanvas'));
  const tenants = [], parts = [], sparks = []; let next = 0, months = 0;
  const ui = { ask: $('#dpAsk'), list: $('#dpTenants'), v: $('#dpVerdict'), cfg: $('#dpConfig'), cus: $('#dpCustom') };
  const cost = () => tenants.reduce((s, t) => s + FRESH[t.fresh].cost + (t.custom ? 2000 : 0), 0);
  function render() {
    const b = BANKS[next];
    ui.ask.innerHTML = b ? `<small>Bank ${next + 1} of 4 is asking</small><b>${b.name}</b><p>"${b.ask}"</p>` : '<small>All four banks are live</small><b>Pipeline full</b><p>Change any bank\'s freshness and watch the bill.</p>';
    ui.cfg.disabled = ui.cus.disabled = !b;
    ui.list.innerHTML = tenants.map((t, i) => `<li><span><i style="background:${t.col}"></i>${t.name}${t.custom ? '<span class="cu">custom</span>' : ''}</span>
      <select data-i="${i}" aria-label="Data freshness for ${t.name}">${FRESH.map((f, k) => `<option value="${k}"${k === t.fresh ? ' selected' : ''}>${f.k}</option>`).join('')}</select><span class="c">${money(FRESH[t.fresh].cost + (t.custom ? 2000 : 0))}/mo</span></li>`).join('');
    $('#dpLive').textContent = tenants.filter(t => t.live >= 1).length; $('#dpMonths').textContent = months; $('#dpCost').textContent = money(cost());
    $('#dpPaths').textContent = tenants.filter(t => t.custom).length;
    if (next >= 4) {
      const cu = tenants.filter(t => t.custom).length, rt = tenants.filter(t => t.fresh === 2).length;
      ui.v.textContent = cu ? `${cu} custom build${cu > 1 ? 's' : ''}: ${months} months to onboard four banks, and ${cu} code path${cu > 1 ? 's' : ''} to keep alive forever.`
        : rt >= 2 ? `0 code changes, ${months} months for four banks. Now look at the bill: does a daily finance extract need real-time?`
        : `That's the platform: 0 code changes, about a month a bank, and freshness paid for only where it matters.`;
      T.dp = { months, custom: cu, cost: cost() };
    }
  }
  function onboard(custom) {
    const b = BANKS[next]; if (!b) return;
    tenants.push({ ...b, custom, live: 0, speed: custom ? 0.25 : 1, clock: 0 });
    months += custom ? 4 : 1; next++;
    ui.v.textContent = custom ? `Building it their way. Four months, and a new branch in the pipeline that only ${b.name} uses.` : `Onboarded by subscription and config. No engineering build, about a month.`;
    render();
  }
  ui.cfg.addEventListener('click', () => onboard(false)); ui.cus.addEventListener('click', () => onboard(true));
  ui.list.addEventListener('change', e => { const s = e.target.closest('select'); if (!s) return; tenants[+s.dataset.i].fresh = +s.value; render(); });
  render();
  function draw(dt) {
    const { x, w, h } = cv; if (!x) return; x.clearRect(0, 0, w, h);
    const narrow = w < 560, x0 = narrow ? 18 : 40, x1 = w - (narrow ? 18 : 40), top = 54, lane = (h - top - 34) / 4;
    x.font = `600 ${narrow ? 7 : 9}px ${MONO}`; x.textAlign = 'center';
    STAGES.forEach((s, i) => { const sx = x0 + (x1 - x0) * i / 4; x.fillStyle = '#8FA699'; x.fillText(s, sx, 28); x.strokeStyle = '#1F3129'; x.lineWidth = 1; x.setLineDash([3, 6]); x.beginPath(); x.moveTo(sx, 40); x.lineTo(sx, h - 20); x.stroke(); x.setLineDash([]); });
    tenants.forEach((t, k) => {
      const y = top + lane * (k + 0.5), sx2 = x0 + (x1 - x0) * 0.5, sx3 = x0 + (x1 - x0) * 0.75;
      if (t.live < 1) {
        t.live = Math.min(1, t.live + dt * 0.55 * t.speed);
        x.fillStyle = '#1F3129'; x.fillRect(x0, y - 4, x1 - x0, 8); x.fillStyle = t.col; x.fillRect(x0, y - 4, (x1 - x0) * t.live, 8);
        x.fillStyle = '#EAF2EC'; x.textAlign = 'left'; x.fillText(`onboarding ${t.name} · month ${Math.min(t.custom ? 4 : 1, 1 + Math.floor(t.live * (t.custom ? 4 : 1)))} of ${t.custom ? 4 : 1}`, x0, y - 14);
        return;
      }
      const path = u => { const px = x0 + (x1 - x0) * u; let py = y; if (t.custom && px > sx2 && px < sx3) py = y + Math.sin((px - sx2) / (sx3 - sx2) * Math.PI) * lane * 0.36; return [px, py]; };
      x.strokeStyle = '#1F3129'; x.lineWidth = narrow ? 12 : 16; x.lineCap = 'round'; x.beginPath();
      for (let u = 0; u <= 1.001; u += 0.02) { const [px, py] = path(u); u ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
      if (t.custom) { const [px, py] = path(0.62); x.fillStyle = '#FF2D78'; x.textAlign = 'center'; x.fillText('CUSTOM', px, py + lane * 0.36 + 2); if (Math.random() < dt * 0.5) sparks.push({ x: px, y: py, t: 0 }); }
      const f = FRESH[t.fresh]; t.clock += dt;
      if (t.clock >= f.every) { t.clock = 0; for (let n = 0; n < f.n; n++) parts.push({ k, u: -n * 0.008, v: f.v / (x1 - x0) * (t.custom ? 0.8 : 1), col: t.col }); }
      x.fillStyle = t.col; x.textAlign = 'left'; x.fillText(`${t.name} · ${f.k.toLowerCase()}`, x0, y - (narrow ? 12 : 16));
    });
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i], t = tenants[p.k]; p.u += p.v * dt; if (p.u > 1) { parts.splice(i, 1); continue; } if (p.u < 0) continue;
      const y = top + lane * (p.k + 0.5), sx2 = x0 + (x1 - x0) * 0.5, sx3 = x0 + (x1 - x0) * 0.75, px = x0 + (x1 - x0) * p.u;
      const py = t.custom && px > sx2 && px < sx3 ? y + Math.sin((px - sx2) / (sx3 - sx2) * Math.PI) * lane * 0.36 : y;
      x.fillStyle = p.col; x.beginPath(); x.arc(px, py, 2.6, 0, 7); x.fill(); }
    for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.t += dt; if (s.t > 0.6) { sparks.splice(i, 1); continue; } x.strokeStyle = `rgba(255,45,120,${1 - s.t / 0.6})`; x.lineWidth = 2; x.beginPath(); x.arc(s.x, s.y, 6 + s.t * 30, 0, 7); x.stroke(); }
    if (!tenants.length) { x.fillStyle = '#8FA699'; x.textAlign = 'center'; x.font = `400 ${narrow ? 11 : 13}px ${MONO}`; x.fillText('an empty pipeline, waiting for its first bank', w / 2, h / 2); }
  }
  whenVisible($('#m-data'), dt => draw(dt));
}

/* ================= Sparrow Card: launch pace against support load ================= */
{
  const cv = canvas($('#spCanvas'));
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  let run = false, m = 0, issued = 0, q = 0, rel = 0, frt = 0, csat = 0, hist = [];
  const pace = () => +$('#spPace').value, auto = () => $('#spAuto').checked;
  $('#spPace').addEventListener('input', e => { $('#spPaceV').textContent = e.target.value; });
  $('#spGo').addEventListener('click', () => { run = true; m = 0; issued = 0; q = 0; rel = 0; hist = []; csat = 2.5; $('#spGo').textContent = 'Restart the launch'; $('#spVerdict').textContent = 'Launching…'; });
  const target = () => 150000 * Math.min(1.06, 0.72 + 0.065 * pace());
  const S = mm => target() / (1 + Math.exp(-1.25 * (mm - 3.6)));
  function step(dt) {
    if (!run) return;
    const dm = dt / (reduce ? 1 : 4.2), prev = issued; m = Math.min(7, m + dm); issued = S(m) - S(0) * (1 - m / 7);
    const newCards = Math.max(0, issued - prev), arrivals = newCards * 0.03 + 25 * pace() ** 1.5 * dm, cap = (auto() ? 2700 : 900) * dm;
    q = Math.max(0, q + arrivals - cap); rel += pace() * 4.33 * dm;
    frt = 0.5 + (q / ((auto() ? 2700 : 900) / 720));
    const target = clamp(4.7 - 0.55 * Math.log2(1 + frt / 4), 1.4, 4.7); csat += (target - csat) * Math.min(1, dt * 1.5);
    hist.push([m, issued, q]);
    if (m >= 7) { run = false;
      $('#spVerdict').textContent = csat < 3 ? `${Math.round(issued / 1000)}K cards, and support drowned: CSAT ${csat.toFixed(1)}. Automate support before you scale.`
        : issued < 148000 ? `Safe but slow: ${Math.round(issued / 1000)}K cards. Fewer releases, fewer cardholders.`
        : `That's the launch: ${Math.round(issued / 1000)}K cards by July, and support rated ${csat.toFixed(1)}.`;
      T.sp = { issued, csat, rel }; }
  }
  function draw() {
    const { x, w, h } = cv; if (!x) return; x.clearRect(0, 0, w, h);
    const narrow = w < 560, px = narrow ? 14 : 24, gw = w - px * 2, gh = h * 0.55, gy = 10;
    x.strokeStyle = '#1E2A55'; x.lineWidth = 1; x.font = `600 ${narrow ? 7 : 9}px ${MONO}`; x.fillStyle = '#9EA6C4'; x.textAlign = 'center';
    MONTHS.forEach((mo, i) => { const gx = px + gw * i / 7; x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx, gy + gh); x.stroke(); x.fillText(mo.toUpperCase(), px + gw * (i + 0.5) / 7, gy + gh + 14); });
    const yOf = v => gy + gh - gh * v / 160000;
    x.setLineDash([4, 6]); x.strokeStyle = 'rgba(242,193,78,0.5)'; x.beginPath(); x.moveTo(px, yOf(150000)); x.lineTo(px + gw, yOf(150000)); x.stroke(); x.setLineDash([]);
    x.textAlign = 'right'; x.fillStyle = '#F2C14E'; x.fillText('150K', px + gw, yOf(150000) - 6);
    if (hist.length) {
      x.beginPath(); x.moveTo(px, gy + gh); hist.forEach(([mm, v]) => x.lineTo(px + gw * mm / 7, yOf(v))); const [lm] = hist[hist.length - 1]; x.lineTo(px + gw * lm / 7, gy + gh); x.closePath();
      x.fillStyle = 'rgba(242,193,78,0.18)'; x.fill(); x.strokeStyle = '#F2C14E'; x.lineWidth = 2.5; x.beginPath(); hist.forEach(([mm, v], i) => i ? x.lineTo(px + gw * mm / 7, yOf(v)) : x.moveTo(px + gw * mm / 7, yOf(v))); x.stroke();
    }
    const ty = gy + gh + 44, th = h - ty - 8, n = Math.min(400, Math.round(q / 6)), cols = Math.floor(gw / 9);
    x.fillStyle = '#9EA6C4'; x.textAlign = 'left'; x.fillText('SUPPORT QUEUE', px, ty - 6);
    for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols), yy = ty + th - 6 - r * 8; if (yy < ty + 6) break; x.fillStyle = i > n * 0.6 ? '#FF2D78' : '#F2C14E'; x.fillRect(px + c * 9, yy, 6, 6); }
    $('#spIssued').textContent = Math.round(issued).toLocaleString('en-US'); $('#spMonth').textContent = `${MONTHS[Math.min(6, Math.floor(m))]} 2024`;
    $('#spRel').textContent = Math.round(rel); $('#spQ').textContent = Math.round(q).toLocaleString('en-US');
    $('#spFrt').textContent = hist.length ? (frt < 1 ? `${Math.round(frt * 60)} min` : frt < 48 ? `${frt.toFixed(0)} h` : `${(frt / 24).toFixed(0)} days`) : '-';
    $('#spCsat').textContent = hist.length ? csat.toFixed(1) : '-';
  }
  whenVisible($('#m-launch'), dt => { step(dt); draw(); });
}

/* ================= RBI wind-down: 22 fintechs, 3 CSMs, 60 days ================= */
{
  let seed = 11; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const F = Array.from({ length: 22 }, (_, i) => { const s = 1 + Math.floor(rnd() * 5); return { id: `FT-${String(i + 1).padStart(2, '0')}`, s, a: 2 + s * 1.5, w: 2 + s * 1.6 }; });
  const tiles = $('#rbTiles'); tiles.innerHTML = F.map(f => `<span title="size ${f.s} of 5">${f.id}</span>`).join('');
  const cv = canvas($('#rbCanvas'));
  let plan = null, day = 0, sched = null;
  function schedule(p) {
    const order = [...F].sort((a, b) => p === 'easy' ? a.s - b.s : b.s - a.s);
    const out = [];
    if (p === 'lanes') { const free = [0, 0, 0]; for (const f of order) { const k = free.indexOf(Math.min(...free)), st = free[k]; free[k] = st + f.a; out.push({ f, lane: k, st, ae: st + f.a, end: st + f.a + f.w }); } }
    else { let t = 0; for (const f of order) { out.push({ f, lane: 0, st: t, ae: t + f.a, end: t + f.a + f.w }); t += f.a + f.w; } }
    return out;
  }
  document.querySelectorAll('[data-plan]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-plan]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    plan = b.dataset.plan; sched = schedule(plan); day = 0; $('#rbVerdict').textContent = 'Day 0. The clock is running.';
  }));
  function step(dt) {
    if (!sched) return;
    if (day < 66) { day = Math.min(66, day + dt * (reduce ? 60 : 6)); if (day >= 66) {
      const done = sched.filter(s => s.end <= 60).length;
      $('#rbVerdict').textContent = done === 22 ? `All 22 closed by day ${Math.ceil(Math.max(...sched.map(s => s.end)))}. Three people working in parallel, never waiting on a bank to settle.`
        : plan === 'easy' ? `${done} of 22 by day 60. Quick wins first, and the big ones miss the deadline.` : `${done} of 22 by day 60. The big ones are done, and everyone else is out of time.`;
      T.rb = { plan, done }; } }
    sched.forEach(s => { const el = tiles.children[F.indexOf(s.f)]; el.className = s.end <= day && s.end <= 60 ? 'done' : day >= 60 && s.end > 60 ? 'miss' : s.st <= day ? 'on' : ''; });
  }
  function draw() {
    const { x, w, h } = cv; if (!x) return; x.clearRect(0, 0, w, h);
    const narrow = w < 560, px = narrow ? 34 : 64, gw = w - px - (narrow ? 22 : 34), dx = gw / 70, top = 46;
    x.font = `600 ${narrow ? 7 : 9}px ${MONO}`; x.fillStyle = '#5D574A'; x.textAlign = 'center';
    for (let d = 0; d <= 70; d += 10) { const gx = px + d * dx; x.fillText(`DAY ${d}`, gx, 18); x.strokeStyle = '#E4DAC0'; x.beginPath(); x.moveTo(gx, 24); x.lineTo(gx, h - 8); x.stroke(); }
    x.strokeStyle = '#C8102E'; x.lineWidth = 2; x.beginPath(); x.moveTo(px + 60 * dx, 24); x.lineTo(px + 60 * dx, h - 8); x.stroke(); x.lineWidth = 1;
    x.fillStyle = '#C8102E'; x.fillText(narrow ? 'DEADLINE' : 'RBI DEADLINE', px + 60 * dx, 34);
    const lanes = plan === 'lanes' ? 3 : 1, lh = Math.min(46, (h - top - 30) / 3);
    x.textAlign = 'right'; x.fillStyle = '#1B1A16';
    for (let l = 0; l < lanes; l++) x.fillText(lanes === 1 ? 'TEAM' : `CSM ${l + 1}`, px - 8, top + l * (lh + 6) + lh / 2 + 3);
    if (!sched) { x.textAlign = 'center'; x.fillStyle = '#5D574A'; x.font = `400 ${narrow ? 11 : 13}px ${MONO}`; x.fillText('choose a plan above', px + gw / 2, h / 2); return; }
    sched.forEach(s => {
      if (s.st > day) return; const y = top + s.lane * (lh + 6), a1 = Math.min(s.ae, day), w1 = Math.min(s.end, day);
      x.fillStyle = s.end > 60 && day >= 60 ? '#E9B2BC' : '#1B1A16'; x.fillRect(px + s.st * dx, y, (a1 - s.st) * dx, lh);
      if (day > s.ae) { x.save(); x.beginPath(); x.rect(px + s.ae * dx, y + (lanes === 1 ? 0 : lh * 0.62), (w1 - s.ae) * dx, lanes === 1 ? lh : lh * 0.38); x.clip();
        x.strokeStyle = '#1F7A4D'; for (let k = -20; k < w; k += 5) { x.beginPath(); x.moveTo(px + k, y + lh); x.lineTo(px + k + lh, y); x.stroke(); } x.restore(); }
      if (!narrow && (a1 - s.st) * dx > 30) { x.fillStyle = '#F6F0DF'; x.textAlign = 'left'; x.fillText(s.f.id, px + s.st * dx + 4, y + lh / 2 + 3); }
    });
    x.strokeStyle = '#C8102E'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(px + day * dx, 24); x.lineTo(px + day * dx, h - 20); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#1B1A16'; x.textAlign = 'left'; x.fillText(`DAY ${Math.floor(day)}`, px + day * dx + 4, h - 10);
    x.fillStyle = '#5D574A'; 
  }
  whenVisible($('#m-winddown'), dt => { step(dt); draw(); });
}

/* ================= the receipt ================= */
$('#print').addEventListener('click', () => {
  const d = T.desk || {}, rows = [];
  const r = (k, v) => rows.push(`<div class="r"><span>${k}</span><b>${v}</b></div>`), g = k => rows.push(`<div class="g">${k}</div>`);
  g('Issuing rail'); r('Cards you issued', T.mine || 0); r('Settled', T.mineSettled || 0);
  g('Connector Studio'); r('Result', T.cs ? (T.cs.result === 'shipped' ? `shipped, ${T.cs.days.toFixed(1)} days` : 'production incident') : 'not run');
  g('Fraud desk'); r('Providers paid', d.paid || 0); r('Fraud let through', d.fraud || 0); r('Real payments blocked', d.fp || 0);
  g('Data platform'); r('Banks onboarded', T.dp ? `4 in ${T.dp.months} months` : 'not run'); if (T.dp) r('Custom code paths', T.dp.custom);
  g('Sparrow launch'); r('Cards by July', T.sp ? `${Math.round(T.sp.issued / 1000)}K · CSAT ${T.sp.csat.toFixed(1)}` : 'not run');
  g('RBI wind-down'); r('Closed by day 60', T.rb ? `${T.rb.done} of 22` : 'not run');
  const ran = [T.mine, T.cs, (d.paid || 0) + (d.fraud || 0), T.dp, T.sp, T.rb].filter(Boolean).length;
  const slip = $('#slip');
  slip.innerHTML = `<h3>SETTLED</h3><p class="c">parth8.github.io/portfolio · ${new Date().toISOString().slice(0, 10)}</p>${rows.join('')}
    <div class="tot"><span>Machines run</span><span>${ran} / 6</span></div>
    <p class="c" style="margin-top:0.8rem">All of them boring. That's the point.<br>8parthaggarwal1999@gmail.com</p><div class="bc" aria-hidden="true"></div>`;
  slip.classList.remove('print'); void slip.offsetWidth; if (!reduce) slip.classList.add('print');
});
