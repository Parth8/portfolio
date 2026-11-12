// The case studies, played. Each game is one real decision from the job, about thirty seconds long, and ends on
// what actually happened. Loaded only when someone presses "Run it yourself".

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

let dlg = null, live = null, opener = null;
export function openGame(name, from) {
  const G = GAMES[name];
  if (!G) return;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'play';
    document.body.append(dlg);
    dlg.addEventListener('close', () => { live?.destroy?.(); live = null; dlg.innerHTML = ''; opener?.focus(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  opener = from;
  dlg.setAttribute('aria-label', G.label);
  dlg.innerHTML = `<div class="play-sheet">
    <header class="play-h">
      <p class="play-k">${G.kicker}</p>
      <h2 class="play-t">${G.title}</h2>
      <p class="play-s">${G.intro}</p>
      <button type="button" class="play-x">Close ✕</button>
    </header>
    <div class="play-body"></div>
  </div>`;
  dlg.querySelector('.play-x').addEventListener('click', () => dlg.close());
  dlg.showModal();
  live = G.mount(dlg.querySelector('.play-body'));
}

const GAMES = {
  /* ---------- Backbase · Connector Studio: be the human in the loop ---------- */
  connector: {
    label: "Review the agent's mappings",
    kicker: 'Case <b>/001</b> · Backbase · Connector Studio',
    title: "Review the <em>agent's</em> work",
    intro: "The agent has mapped a bank's core fields onto Backbase's BIAN APIs. Two of these six are wrong. Tap the ones you would send back, then ship.",
    mount(root) {
      const POOL = [
        ['acct_no', 'accountIdentification', 'iban', 'payments post to the IBAN field instead of the account'],
        ['avail_bal', 'availableBalance', 'ledgerBalance', 'customers see their ledger balance as money they can spend'],
        ['ledger_bal', 'ledgerBalance', 'availableBalance', 'statements show the spendable balance as the booked one'],
        ['ccy_cd', 'currency', 'transactionAmount', 'currency codes are read as amounts'],
        ['txn_dt', 'transactionDate', 'status', 'dates land in the status field'],
        ['txn_amt', 'transactionAmount', 'currency', 'amounts are read as currency codes'],
        ['cust_nm', 'customerName', 'branchReference', 'customer names land in the branch field'],
        ['iban_no', 'iban', 'accountIdentification', 'IBANs land in the account number'],
        ['stat_cd', 'status', 'transactionDate', 'status codes are read as dates'],
        ['brn_id', 'branchReference', 'customerName', 'branch codes show up as customer names'],
      ];
      let rows = [], shipped = false;
      root.innerHTML = `<div class="g-art gmap" role="group" aria-label="Field mappings"></div>
        <div class="g-row"><button type="button" class="g-btn pri" data-ship>Ship to production</button><span class="g-note" data-count></span></div>
        <div data-out></div>`;
      const board = root.querySelector('.gmap'), out = root.querySelector('[data-out]'), count = root.querySelector('[data-count]');
      function deal() {
        shipped = false; out.innerHTML = '';
        const pick = shuffle([...POOL]).slice(0, 6), bad = new Set(shuffle([0, 1, 2, 3, 4, 5]).slice(0, 2));
        rows = pick.map((p, i) => ({ from: p[0], to: bad.has(i) ? p[2] : p[1], wrong: bad.has(i), harm: p[3], flagged: false }));
        board.classList.remove('done');
        board.innerHTML = `<div class="gmap-h"><span>The bank's core</span><span></span><span>BIAN unified API</span></div>` +
          rows.map((r, i) => `<button type="button" class="gmap-row" aria-pressed="false" data-i="${i}" style="--i:${i}">
            <span class="f">${r.from}</span><span class="ln" aria-hidden="true"></span><span class="t">${r.to}</span><span class="tag" aria-hidden="true">sent back</span></button>`).join('');
        root.querySelector('[data-ship]').textContent = 'Ship to production';
        paint();
      }
      const paint = () => { const n = rows.filter(r => r.flagged).length; count.textContent = n ? `${plural(n, 'mapping')} sent back` : 'nothing flagged yet'; };
      board.addEventListener('click', e => {
        const b = e.target.closest('.gmap-row');
        if (!b || shipped) return;
        const r = rows[+b.dataset.i];
        r.flagged = !r.flagged;
        b.setAttribute('aria-pressed', String(r.flagged));
        paint();
      });
      root.querySelector('[data-ship]').addEventListener('click', e => {
        if (shipped) { deal(); return; }
        shipped = true;
        board.classList.add('done');
        rows.forEach((r, i) => board.children[i + 1].classList.add(r.wrong ? (r.flagged ? 'r-caught' : 'r-missed') : (r.flagged ? 'r-false' : 'r-ok')));
        const missed = rows.filter(r => r.wrong && !r.flagged), extra = rows.filter(r => !r.wrong && r.flagged).length;
        out.innerHTML = missed.length
          ? `<p class="g-verdict bad"><b>Production incident:</b> ${esc(missed[0].harm)}. ${missed.length > 1 ? 'And that is one of two. ' : ''}At a real bank, customers would see it before anyone at Backbase did. This is why every build stays in pre-prod until the mappings are right.
              <span class="real">The real one: every Connector Studio build is gated to pre-prod until mapping accuracy is safe for production traffic.</span></p>`
          : `<p class="g-verdict"><b>Both caught${extra ? `, plus ${plural(extra, 'false alarm')}` : ''}.</b> Shipped in about two days instead of twelve${extra ? ', a little slower than it needed to be' : ''}. The agent does the typing, a person checks the meaning.
              <span class="real">The real one: ~12 days to ~2 per connector, with mapping accuracy taken from ~50-60% to 90%+ against a golden dataset.</span></p>`;
        e.currentTarget.textContent = 'Try another bank';
      });
      deal();
      return {};
    },
  },

  /* ---------- Zeta for Optum · the fraud rule ---------- */
  fraud: {
    label: 'Set the fraud rule',
    kicker: 'Case <b>/002</b> · Zeta, for Optum Financial',
    title: 'Set the <em>fraud</em> rule',
    intro: 'Forty payments to healthcare providers, each with a risk score. Anything above your line is held. Fraud hides at high scores, but so do some real payments. Run them, then move the line and watch what changes.',
    mount(root) {
      root.innerHTML = `<div class="g-art gfr-art"><canvas aria-label="Payments by risk score"></canvas></div>
        <div class="gfr-ctl"><label for="frRule">Hold payments with a risk score above<b data-v>70</b></label><input id="frRule" type="range" min="5" max="99" value="70"></div>
        <dl class="g-meters"><div><dt>Providers paid</dt><dd class="ok" data-paid>0</dd></div><div><dt>Fraud got through</dt><dd class="bad" data-fraud>0</dd></div><div><dt>Real payments held</dt><dd class="warn" data-held>0</dd></div></dl>
        <div class="g-row"><button type="button" class="g-btn pri" data-go>Run 40 payments</button><span class="g-note">tip: move the line after the run</span></div>
        <div data-out></div>`;
      const cv = root.querySelector('canvas'), rule = root.querySelector('#frRule'), out = root.querySelector('[data-out]');
      let x, w, h, pays = [], t = 0, raf = 0, running = false, ran = false;
      const fit = () => { const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); cv.width = r.width * d; cv.height = r.height * d; x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); w = r.width; h = r.height; };
      fit();
      const ro = new ResizeObserver(() => { fit(); draw(); }); ro.observe(cv);
      function deal() {
        pays = shuffle(Array.from({ length: 40 }, (_, i) => {
          const fraud = i < 6;
          const risk = Math.round(fraud ? 58 + 41 * Math.random() ** 0.8 : 82 * Math.random() ** 1.7);
          return { fraud, risk, at: 0 };
        }));
        pays.forEach((p, i) => { p.at = i * 0.2; });
        const stack = {};
        pays.forEach(p => { const b = Math.floor(p.risk / 3); p.slot = stack[b] = (stack[b] || 0) + 1; });
      }
      function tally() {
        const r = +rule.value, landed = pays.filter(p => t >= p.at + 0.45);
        const paid = landed.filter(p => !p.fraud && p.risk <= r).length, fraud = landed.filter(p => p.fraud && p.risk <= r).length, held = landed.filter(p => !p.fraud && p.risk > r).length;
        root.querySelector('[data-paid]').textContent = paid; root.querySelector('[data-fraud]').textContent = fraud; root.querySelector('[data-held]').textContent = held;
        return { paid, fraud, held };
      }
      function verdict() {
        const { fraud, held } = tally(), legit = pays.filter(p => !p.fraud).length;
        const tone = fraud >= 2 ? 'loose' : held >= 4 ? 'tight' : 'right';
        out.innerHTML = `<p class="g-verdict${tone === 'right' ? '' : ' bad'}">${
          tone === 'loose' ? `<b>Too loose.</b> ${plural(fraud, 'fraudulent payment')} got paid. Pull the line down.`
          : tone === 'tight' ? `<b>Too tight.</b> ${held} of ${legit} real providers are waiting on their money, and they will call. Push the line up.`
          : `<b>That's the job.</b> ${fraud ? 'One fraud slipped through' : 'No fraud got through'}, and only ${plural(held, 'real payment')} held for review.`}
          <span class="real">The real one: a rules engine on merchant, amount and risk thresholds, with FeatureSpace's machine-learning score feeding the risk. $2B+ a year, 0 P1/P2 defects at launch.</span></p>`;
      }
      function draw() {
        if (!x) return;
        x.clearRect(0, 0, w, h);
        const px = 18, base = h - 30, gw = w - px * 2, bw = gw / 33, r = +rule.value, lx = px + gw * r / 99;
        x.fillStyle = 'rgba(126,122,112,0.9)'; x.font = '600 9px "DM Mono", monospace'; x.textAlign = 'center';
        [0, 25, 50, 75, 99].forEach(v => x.fillText(v, px + gw * v / 99, h - 10));
        x.textAlign = 'left'; x.fillText('LOW RISK', px, 16); x.textAlign = 'right'; x.fillText('HIGH RISK', w - px, 16);
        x.strokeStyle = '#3a362d'; x.beginPath(); x.moveTo(px, base + 0.5); x.lineTo(w - px, base + 0.5); x.stroke();
        x.fillStyle = 'rgba(255,45,120,0.08)'; x.fillRect(lx, 22, w - px - lx, base - 22);
        x.strokeStyle = '#00FF94'; x.lineWidth = 2; x.beginPath(); x.moveTo(lx, 24); x.lineTo(lx, base); x.stroke(); x.lineWidth = 1;
        x.fillStyle = '#00FF94'; x.textAlign = lx > w - 90 ? 'right' : 'left'; x.fillText('HOLD →', lx + (lx > w - 90 ? -6 : 6), 34);
        const rad = Math.max(3, Math.min(7, bw * 0.42));
        for (const p of pays) {
          const k = (t - p.at) / 0.45;
          if (k <= 0) continue;
          const e = Math.min(1, k), cx = px + (Math.floor(p.risk / 3) + 0.5) * bw, cy = base - (p.slot - 0.5) * rad * 2.3;
          const y = 24 + (cy - 24) * (1 - (1 - e) ** 3);
          const held = p.risk > r, landed = e >= 1;
          x.fillStyle = !landed ? '#F3EFE4' : p.fraud ? (held ? '#7E7A70' : '#FF2D78') : (held ? '#E6B547' : '#00FF94');
          if (landed && p.fraud && !held) { x.shadowColor = '#FF2D78'; x.shadowBlur = 12; }
          x.beginPath(); x.arc(cx, y, rad, 0, 7); x.fill(); x.shadowBlur = 0;
          if (landed && p.fraud) { x.strokeStyle = '#15130F'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(cx - rad * 0.5, y - rad * 0.5); x.lineTo(cx + rad * 0.5, y + rad * 0.5); x.moveTo(cx + rad * 0.5, y - rad * 0.5); x.lineTo(cx - rad * 0.5, y + rad * 0.5); x.stroke(); x.lineWidth = 1; }
        }
        if (!pays.length) { x.fillStyle = '#E6B547'; x.textAlign = 'center'; x.font = '700 22px Caveat, cursive'; x.fillText('forty payments are waiting', w / 2, h / 2); }
      }
      function loop(now) {
        if (!running) return;
        t = (now - loop.t0) / 1000;
        draw(); tally();
        if (t >= pays[pays.length - 1].at + 0.6) { running = false; ran = true; root.querySelector('[data-go]').disabled = false; root.querySelector('[data-go]').textContent = 'Run 40 new payments'; verdict(); return; }
        raf = requestAnimationFrame(loop);
      }
      root.querySelector('[data-go]').addEventListener('click', e => {
        deal(); out.innerHTML = ''; e.currentTarget.disabled = true;
        if (reduce) { t = 99; draw(); tally(); ran = true; e.currentTarget.disabled = false; verdict(); return; }
        running = true; loop.t0 = performance.now(); raf = requestAnimationFrame(loop);
      });
      rule.addEventListener('input', () => { root.querySelector('[data-v]').textContent = rule.value; draw(); tally(); if (ran && !running) verdict(); });
      draw();
      return { destroy() { running = false; cancelAnimationFrame(raf); ro.disconnect(); } };
    },
  },

  /* ---------- Zeta · Data Platform SaaS: three banks, three asks ---------- */
  data: {
    label: 'Answer three banks',
    kicker: 'Case <b>/003</b> · Zeta · Data Platform SaaS',
    title: 'Answer <em>three</em> banks',
    intro: 'Every bank wants something built just for them, and every yes is code someone keeps alive forever. Answer three real kinds of request and watch the pipeline.',
    mount(root) {
      const ASKS = [
        { who: 'A US card issuer', q: 'Can you build our own data format, just for us?', ctx: '', a: [['Onboard by config', '~1 month', 'config'], ['Build it for them', '~4 months', 'custom']] },
        { who: 'An EMEA lender', q: 'We need real-time data.', ctx: 'it feeds a monthly finance report', a: [['Daily batch', '$1.2K a month', 'daily'], ['Real-time', '$9K a month', 'realtime']] },
        { who: 'A UK neobank', q: 'Can you build a bespoke feed into our warehouse?', ctx: '', a: [['Onboard by config', '~1 month', 'config'], ['Build it for them', '~4 months', 'custom']] },
      ];
      const COL = ['#E6B547', '#00FF94', '#FF2D78'];
      const COST = { daily: 1200, hourly: 3500, realtime: 9000 };
      let step = 0, picks = [];
      root.innerHTML = `<div class="gdp"><div class="gdp-ask" aria-live="polite"></div><div class="g-art gdp-art"></div></div>
        <dl class="g-meters"><div><dt>Months to onboard</dt><dd data-m>0</dd></div><div><dt>Data bill a month</dt><dd data-c>$0</dd></div><div><dt>Custom code paths</dt><dd class="bad" data-p>0</dd></div></dl>
        <div data-out></div>`;
      const ask = root.querySelector('.gdp-ask'), art = root.querySelector('.gdp-art'), out = root.querySelector('[data-out]');
      const money = n => `$${(n / 1000).toFixed(1)}K`;
      function lanes() {
        const X = [50, 170, 300, 430, 550], st = ['INGEST', 'BRONZE', 'SILVER', 'GOLD', 'EXTRACTS'];
        let svg = `<svg viewBox="0 0 600 270" role="img" aria-label="Data pipeline, one lane per bank">`;
        X.forEach((xx, i) => { svg += `<line class="st" x1="${xx}" y1="30" x2="${xx}" y2="250"/><text x="${xx}" y="20" text-anchor="middle">${st[i]}</text>`; });
        picks.forEach((p, i) => {
          const y = 75 + i * 70, d = p.custom ? `M50 ${y} H280 C300 ${y - 46} 410 ${y - 46} 430 ${y} H550` : `M50 ${y} H550`;
          svg += `<g class="lane"><path class="pipe" d="${d}"/><path class="flow ${p.fresh}" d="${d}" stroke="${COL[i]}"/>
            <text class="lab" x="50" y="${y - 14}">${esc(ASKS[i].who.replace(/^An? /, ''))} · ${p.fresh}</text>
            ${p.custom ? `<path class="cust" d="M280 ${y} C300 ${y - 46} 410 ${y - 46} 430 ${y}"/><text class="cl" x="355" y="${y - 40}" text-anchor="middle">built just for them</text>` : ''}</g>`;
        });
        if (!picks.length) svg += `<text x="300" y="145" text-anchor="middle" class="cl" style="font-size:22px;fill:#E6B547">an empty pipeline</text>`;
        art.innerHTML = svg + '</svg>';
        const months = picks.reduce((s, p) => s + (p.custom ? 4 : 1), 0), cost = picks.reduce((s, p) => s + COST[p.fresh] + (p.custom ? 2000 : 0), 0), paths = picks.filter(p => p.custom).length;
        root.querySelector('[data-m]').textContent = months; root.querySelector('[data-c]').textContent = money(cost); root.querySelector('[data-p]').textContent = paths;
        return { months, cost, paths };
      }
      function show() {
        if (step >= ASKS.length) {
          const { months, paths } = lanes(), rt = picks[1].fresh === 'realtime';
          const good = !paths && !rt;
          ask.innerHTML = `<p class="who">All three banks are live</p><q>${good ? 'Three banks, three months, no custom code.' : 'Live, at a price.'}</q><div class="opts"><button type="button" class="g-btn" data-again>Start over</button></div>`;
          const bits = [];
          if (paths) bits.push(`${plural(paths, 'custom build')} added ${paths * 3} months and ${plural(paths, 'code path')} to maintain forever`);
          if (rt) bits.push('real-time for a report read once a month costs $7.8K a month more than daily batch');
          out.innerHTML = `<p class="g-verdict${good ? '' : ' bad'}">${good
            ? `<b>That's the platform.</b> Onboarding by subscription and config means no engineering build per bank, and freshness is paid for only where someone reads it.`
            : `<b>${months} months for three banks.</b> ${bits.join('; ')}.`}
            <span class="real">The real one: config-only onboarding with 0 code changes per bank, 4 months down to 1, freshness set per tenant against its AWS cost, and ~$50K a year saved by removing MongoDB.</span></p>`;
          ask.querySelector('[data-again]').addEventListener('click', () => { step = 0; picks = []; out.innerHTML = ''; show(); });
          return;
        }
        const A = ASKS[step];
        ask.innerHTML = `<div><p class="who">Bank <b>${step + 1}</b> of 3 · ${esc(A.who)}</p><q>${esc(A.q)}</q>${A.ctx ? `<p class="ctx">${esc(A.ctx)}</p>` : ''}</div>
          <div class="opts">${A.a.map(([l, s, v]) => `<button type="button" class="g-btn" data-v="${v}">${esc(l)} <small>${esc(s)}</small></button>`).join('')}</div>`;
        lanes();
      }
      ask.addEventListener('click', e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const v = b.dataset.v;
        picks.push(step === 1 ? { custom: false, fresh: v } : { custom: v === 'custom', fresh: 'hourly' });
        step++;
        show();
      });
      show();
      return {};
    },
  },

  /* ---------- Zeta · Sparrow Card: support at launch scale ---------- */
  support: {
    label: 'Keep up with support',
    kicker: 'Case <b>/004</b> · Zeta, with Evolve Bank',
    title: 'Keep up with <em>support</em>',
    intro: "Zeta's first US credit card is launching. Every new cardholder can open a ticket. Answer them by tapping, and keep the cardholders happy until July.",
    mount(root) {
      const TICKETS = [['card', 'my card has not arrived'], ['dispute', 'I do not recognise this charge'], ['limit', 'can I get a higher limit?'], ['app', 'cannot log in to the app'], ['payment', 'where did my payment go?'], ['card', 'card declined at checkout'], ['statement', 'what is this fee?'], ['kyc', 'my documents were rejected']];
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
      root.innerHTML = `<div class="gsp-top"><p class="gsp-n" data-n>0</p><p class="gsp-l">cards issued · <span data-mo>Jan 2024</span></p></div>
        <div class="g-art gsp-art"><p class="idle">press start: the first cardholders are on their way</p></div>
        <dl class="g-meters"><div><dt>Tickets waiting</dt><dd class="bad" data-q>0</dd></div><div><dt>Answered by you</dt><dd data-you>0</dd></div><div><dt>First response</dt><dd data-frt>-</dd></div><div><dt>CSAT</dt><dd class="ok" data-csat>2.5</dd></div></dl>
        <div class="g-row"><button type="button" class="g-btn pri" data-go>Start the launch</button><button type="button" class="gsp-auto" data-auto hidden>Automate the routine ones with webhooks →</button></div>
        <div data-out></div>`;
      const art = root.querySelector('.gsp-art'), out = root.querySelector('[data-out]'), autoBtn = root.querySelector('[data-auto]'), go = root.querySelector('[data-go]');
      let raf = 0, running = false, t0 = 0, last = 0, issued = 0, acc = 0, autoAcc = 0, waiting = [], you = 0, auto = false, csat = 2.5, autoAt = null;
      const DUR = reduce ? 6 : 30;
      function addTicket() {
        const [k, txt] = TICKETS[Math.random() * TICKETS.length | 0], el = document.createElement('button');
        el.type = 'button'; el.className = 'gslip';
        el.style.left = `${4 + Math.random() * 74}%`; el.style.top = `${6 + Math.random() * 68}%`; el.style.setProperty('--r', `${(Math.random() * 8 - 4).toFixed(1)}deg`);
        el.innerHTML = `<b>${k}</b>${txt}`;
        art.append(el); waiting.push(el);
      }
      function clear(el, how) { const i = waiting.indexOf(el); if (i < 0) return; waiting.splice(i, 1); el.classList.add(how); setTimeout(() => el.remove(), 360); }
      art.addEventListener('click', e => { const s = e.target.closest('.gslip'); if (s && running) { clear(s, 'gone'); you++; } });
      autoBtn.addEventListener('click', () => { auto = true; autoAt = issued; autoBtn.hidden = true; });
      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000), p = Math.min(1, (now - t0) / 1000 / DUR); last = now;
        issued = Math.round(152000 / (1 + Math.exp(-9 * (p - 0.48))) - 152000 / (1 + Math.exp(4.32)) * (1 - p));
        acc += dt * (0.5 + 2.8 * p);
        while (acc >= 1) { acc -= 1; addTicket(); }
        if (auto) { autoAcc += dt * 7; while (autoAcc >= 1 && waiting.length) { autoAcc -= 1; clear(waiting[0], 'auto'); } }
        if (p > 0.18 && !auto && autoBtn.hidden && autoAt === null) autoBtn.hidden = false;
        const target = Math.max(1.5, Math.min(4.7, 4.7 - waiting.length * 0.11));
        csat += (target - csat) * Math.min(1, dt * 1.2);
        root.querySelector('[data-n]').innerHTML = issued.toLocaleString('en-US');
        root.querySelector('[data-mo]').textContent = `${MONTHS[Math.min(6, Math.floor(p * 7))]} 2024`;
        root.querySelector('[data-q]').textContent = waiting.length; root.querySelector('[data-you]').textContent = you;
        root.querySelector('[data-csat]').textContent = csat.toFixed(1);
        const mins = 2 + waiting.length * 11;
        root.querySelector('[data-frt]').textContent = mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(1)} h`;
        if (p >= 1) return end();
        raf = requestAnimationFrame(frame);
      }
      function end() {
        running = false; autoBtn.hidden = true; go.disabled = false; go.textContent = 'Launch again';
        const good = csat >= 4.2;
        out.innerHTML = `<p class="g-verdict${good ? '' : ' bad'}">${auto
          ? `<b>150K+ cards, support rated ${csat.toFixed(1)}.</b> You answered ${you} by hand, then let automation take the routine ones${autoAt > 90000 ? ', late, so July was rough' : ''}.`
          : `<b>${waiting.length} tickets still waiting, support rated ${csat.toFixed(1)}.</b> You answered ${you} by hand. Nobody hand-answers 150,000 cardholders.`}
          <span class="real">The real one: I built the US support and ops function from scratch, with webhook-based automation. First response time down 99%, CSAT 2.5 to 4.6 in three months, 150K+ cards by July 2024.</span></p>`;
      }
      go.addEventListener('click', () => {
        art.innerHTML = ''; waiting = []; out.innerHTML = ''; you = 0; auto = false; autoAt = null; csat = 2.5; acc = 0; autoAcc = 0;
        go.disabled = true; running = true; t0 = last = performance.now(); raf = requestAnimationFrame(frame);
      });
      return { destroy() { running = false; cancelAnimationFrame(raf); } };
    },
  },
};
