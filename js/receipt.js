// Proof-of-work receipt.
// Every element with data-r="GROUP|label|value" is a line item. When a visitor scrolls past it,
// the docked terminal prints that line. At "Say hi" the receipt totals and gets stamped APPROVED.
// The receipt can be opened, read, used as navigation, and torn off as a PNG.

const KEY = 'pa-receipt-v1';
const GROUPS = { IMPACT: 'Impact', CASES: 'Case studies', JOURNEY: 'Journey', BUILT: 'Built', EXTRAS: 'Also on the page' };
const PAY = [
  ['Email', 'mailto:8parthaggarwal1999@gmail.com?subject=Your%20receipt%20checks%20out'],
  ['LinkedIn', 'https://linkedin.com/in/aggarwalparth'],
  ['Resume', 'https://drive.google.com/file/d/1vTLOz_c9T_ioQVn5VPjvriIwr4d1j905/view?usp=drive_link'],
];

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = st => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode: fine */ } };

export function initReceipt({ reduceMotion = false, onJump } = {}) {
  const root = document.getElementById('receipt');
  if (!root) return null;
  const dock = document.getElementById('rcDock');
  const sheet = document.getElementById('rcSheet');
  const body = document.getElementById('rcScroll');
  const last = document.getElementById('rcLast');
  const count = document.getElementById('rcCount');

  const items = [...document.querySelectorAll('[data-r]')].map((el, i) => {
    const [group, label, value] = el.dataset.r.split('|');
    if (!el.id) el.id = `proof-${i + 1}`;
    return { el, key: el.id, group, label, value };
  });
  const total = items.length;
  const state = load();
  if (!state.txn) state.txn = Math.random().toString(16).slice(2, 6).toUpperCase();
  const printed = new Set((state.seen || []).filter(k => items.some(it => it.key === k)));
  let approved = false;

  const pad = n => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    const mon = d.toLocaleString('en', { month: 'short' }).toUpperCase();
    return `${pad(d.getDate())} ${mon} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function barcode() {
    let x = 0, bars = '';
    const seed = [...(state.txn + 'PARTH')].map(c => c.charCodeAt(0));
    for (let i = 0; x < 300; i++) {
      const w = 1 + (seed[i % seed.length] * (i + 3)) % 4;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="40"/>`;
      x += w + 1;
    }
    return `<svg class="rc-barcode" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><g fill="#15130F">${bars}</g></svg>`;
  }

  function render(freshKey) {
    let lines = '', group = '';
    for (const it of items) {
      if (!printed.has(it.key)) continue;
      if (it.group !== group) { group = it.group; lines += `<li class="rc-group">${GROUPS[group] || group}</li>`; }
      lines += `<li class="rc-line${it.key === freshKey ? ' new' : ''}"><a href="#${it.key}" data-jump><span class="l">${esc(it.label)}</span><span class="d"></span><span class="v">${esc(it.value)}</span></a></li>`;
    }
    const left = total - printed.size;
    body.innerHTML = `
      <div class="rc-center">
        <p class="rc-kicker">✦ proof of work ✦</p>
        <p class="rc-title">Parth Aggarwal</p>
        <p class="rc-sub">Technical platform PM · Hyderabad</p>
      </div>
      <hr class="rc-hr">
      <p class="rc-meta"><span>${stamp()}</span><span>TXN #PA-${state.txn}</span></p>
      <p class="rc-meta"><span>Terminal parth8.github.io</span><span>Visitor</span></p>
      <hr class="rc-hr">
      ${printed.size ? `<ol class="rc-lines">${lines}</ol>` : '<p class="rc-ahead">Nothing printed yet. <b>Scroll</b> - every highlight you pass prints here.</p>'}
      ${left ? `<p class="rc-ahead"><b>${left} more</b> ${left === 1 ? 'line is' : 'lines are'} still on the page.</p>` : ''}
      <hr class="rc-hr">
      <p class="rc-total"><span>Items</span><span>${pad(printed.size)}/${pad(total)}</span></p>
      <p class="rc-total"><span>Total</span><span>1 × Platform PM</span></p>
      <p class="rc-total"><small>Change due</small><small>0 P1/P2 defects</small></p>
      <span class="rc-approved" aria-hidden="${approved ? 'false' : 'true'}">Approved ✓</span>
      ${approved ? '' : '<p class="rc-pending-note">stamped when you reach "say hi"</p>'}
      <div class="rc-actions">
        ${left ? `<button type="button" class="rc-btn primary" data-print-all>Print the rest (${left})</button>` : ''}
        <button type="button" class="rc-btn${left ? '' : ' primary'}" data-tear>Tear it off ⤓</button>
      </div>
      <hr class="rc-hr">
      <p class="rc-pay"><span>Pay with</span>${PAY.map(([t, h]) => `<a href="${h}"${h.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`).join('')}</p>
      ${barcode()}
      <p class="rc-thanks">thank you for scrolling</p>`;
    const n = `${pad(printed.size)}/${pad(total)}`;
    count.textContent = n;
    dock.setAttribute('aria-label', `Proof-of-work receipt: ${printed.size} of ${total} lines printed. Open the receipt.`);
  }

  function print(el, { quiet = false } = {}) {
    const it = items.find(x => x.el === el);
    if (!it || printed.has(it.key)) return;
    printed.add(it.key);
    state.seen = [...printed];
    save(state);
    render(quiet ? null : it.key);
    if (quiet) return;
    last.textContent = `${it.label} ··· ${it.value}`;
    if (!reduceMotion) {
      dock.classList.remove('printing');
      void dock.offsetWidth;
      dock.classList.add('printing');
    }
    if (printed.size === total) approve();
  }

  function printAll() {
    items.forEach(it => printed.add(it.key));
    state.seen = [...printed];
    save(state);
    last.textContent = 'all printed · tap to read';
    approve();
  }

  function approve() {
    approved = true;
    root.classList.add('approved');
    render();
  }

  function open() {
    root.classList.add('open', 'visible');
    dock.setAttribute('aria-expanded', 'true');
    render();
    sheet.focus({ preventScroll: true });
  }
  function close() {
    if (!root.classList.contains('open')) return;
    root.classList.remove('open');
    dock.setAttribute('aria-expanded', 'false');
    dock.focus({ preventScroll: true });
  }

  async function tearOff() {
    try { await document.fonts.ready; } catch { /* fonts are optional */ }
    const W = 640, P = 46, LH = 30, S = 2;
    const rows = [];
    let group = '';
    for (const it of items) {
      if (!printed.has(it.key)) continue;
      if (it.group !== group) { group = it.group; rows.push({ g: GROUPS[group] || group }); }
      rows.push(it);
    }
    const H = 330 + rows.length * LH + 360;
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    const x = c.getContext('2d');
    x.scale(S, S);
    x.fillStyle = '#F3EFE4'; x.fillRect(0, 0, W, H);
    // paper with torn edges
    x.fillStyle = '#FBF8EF';
    x.beginPath(); x.moveTo(20, 20);
    for (let i = 20; i <= W - 20; i += 12) x.lineTo(i, i % 24 ? 26 : 18);
    x.lineTo(W - 20, H - 20);
    for (let i = W - 20; i >= 20; i -= 12) x.lineTo(i, H - (i % 24 ? 26 : 18));
    x.closePath(); x.fill();
    const mono = s => `${s}px "DM Mono", ui-monospace, monospace`;
    const ink = '#15130F', gray = '#7E7A70', pink = '#FF2D78';
    let y = 70;
    x.textAlign = 'center'; x.fillStyle = gray; x.font = mono(13); x.fillText('✦  P R O O F   O F   W O R K  ✦', W / 2, y);
    y += 50; x.fillStyle = ink; x.font = '48px "Bebas Neue", Impact, sans-serif'; x.fillText('PARTH AGGARWAL', W / 2, y);
    y += 28; x.font = mono(13); x.fillText('TECHNICAL PLATFORM PM · HYDERABAD', W / 2, y);
    const rule = () => { y += 22; x.save(); x.strokeStyle = '#b5ae9b'; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(P, y); x.lineTo(W - P, y); x.stroke(); x.restore(); y += 26; };
    rule();
    x.textAlign = 'left'; x.fillStyle = '#4a463c'; x.font = mono(13);
    x.fillText(stamp(), P, y); x.textAlign = 'right'; x.fillText(`TXN #PA-${state.txn}`, W - P, y);
    rule();
    for (const r of rows) {
      x.textAlign = 'left';
      if (r.g) { y += 8; x.fillStyle = pink; x.font = mono(13); x.fillText('» ', P, y); x.fillStyle = ink; x.fillText(r.g.toUpperCase(), P + 22, y); y += LH - 4; continue; }
      x.font = mono(14); x.fillStyle = ink;
      const v = r.value, vw = x.measureText(v).width;
      let l = r.label;
      while (x.measureText(l).width > W - 2 * P - vw - 40 && l.length > 4) l = l.slice(0, -2) + '…';
      x.fillText(l, P, y);
      x.textAlign = 'right'; x.fillText(v, W - P, y);
      const lw = x.measureText(l).width; x.save(); x.strokeStyle = '#9d978a'; x.setLineDash([1, 4]);
      x.beginPath(); x.moveTo(P + lw + 8, y - 4); x.lineTo(W - P - vw - 8, y - 4); x.stroke(); x.restore();
      y += LH;
    }
    rule();
    const tot = (a, b, f = '30px "Bebas Neue", Impact, sans-serif') => { x.font = f; x.fillStyle = ink; x.textAlign = 'left'; x.fillText(a, P, y); x.textAlign = 'right'; x.fillText(b, W - P, y); y += 36; };
    tot('ITEMS', `${pad(printed.size)}/${pad(total)}`);
    tot('TOTAL', '1 × PLATFORM PM');
    tot('CHANGE DUE', '0 P1/P2 DEFECTS', mono(13));
    // the stamp
    x.save(); x.translate(W / 2, y + 34); x.rotate(-0.12);
    x.strokeStyle = pink; x.lineWidth = 4; x.strokeRect(-130, -34, 260, 64);
    x.fillStyle = pink; x.textAlign = 'center'; x.font = '50px "Bebas Neue", Impact, sans-serif'; x.fillText('APPROVED ✓', 0, 16);
    x.restore();
    y += 100;
    // barcode
    x.fillStyle = ink;
    const seed = [...(state.txn + 'PARTH')].map(ch => ch.charCodeAt(0));
    for (let i = 0, bx = P; bx < W - P; i++) { const w = 1 + (seed[i % seed.length] * (i + 3)) % 4; if (i % 2 === 0) x.fillRect(bx, y, w * 1.6, 54); bx += (w + 1) * 1.6; }
    y += 84; x.textAlign = 'center'; x.font = mono(14); x.fillStyle = ink; x.fillText('parth8.github.io/portfolio', W / 2, y);
    y += 28; x.fillStyle = pink; x.font = '24px Caveat, cursive'; x.fillText('thank you for scrolling', W / 2, y);

    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'parth-aggarwal-receipt.png', { type: 'image/png' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Parth Aggarwal - proof of work' }); return; } catch { /* fall through to download */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---- wiring ----
  dock.addEventListener('click', open);
  document.getElementById('rcClose').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.addEventListener('pointerdown', e => { if (root.classList.contains('open') && !root.contains(e.target)) close(); });
  body.addEventListener('click', e => {
    if (e.target.closest('[data-print-all]')) { printAll(); return; }
    if (e.target.closest('[data-tear]')) { tearOff(); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      close();
      const id = jump.getAttribute('href').slice(1);
      // the page may know a better way there (e.g. a case inside the pinned reel)
      if (!onJump?.(id)) document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
  });

  render();
  if (printed.size) last.textContent = `${printed.size} lines printed · tap to read`;
  if (printed.size === total) approve();

  return {
    print, printAll, open, close, approve,
    setVisible: on => root.classList.toggle('visible', on || root.classList.contains('open')),
  };
}
