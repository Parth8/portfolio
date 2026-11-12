// Flip: the portfolio reads like a magazine on Flipboard. Each part of the page is its own page. At the end of a page,
// keep going and the lower half lifts toward you; carry on and it folds over to bring in the next one, let go early and
// it settles back. Fingers drag the fold directly. Without JavaScript, with ?scroll in the address, or when printing,
// the page is one long scroll as before.

const PAGES = [
  ['sec-hero', 'Hello'],
  ['sec-numbers', 'Impact'],
  ['sec-work', 'Work'],
  ['quote-section', 'Principles'],
  ['sec-experience', 'Journey'],
  ['sec-built', 'Built'],
  ['sec-skills', 'Toolkit'],
  ['sec-recognition', 'Recognition'],
  ['sec-writings', 'Writing'],
  ['sec-manifesto', 'Manifesto'],
  ['contact', 'Say hi'],
];

export function initFlip({ reduceMotion = false } = {}) {
  if (/[?&]scroll\b/.test(location.search)) return null;
  const root = document.documentElement;
  const first = document.getElementById('sec-hero');
  if (!first) return null;

  /* ---------- build the pages: each listed section starts one, everything after it joins until the next ---------- */
  const starts = PAGES.map(([key]) => document.getElementById(key) || document.querySelector(`body > .${key}`));
  const book = document.createElement('div');
  book.className = 'flipbook';
  first.before(book);
  const pages = [];
  let node = first, cur = null;
  while (node) {
    const next = node.nextElementSibling;
    if (node.tagName === 'SCRIPT') { node = next; continue; }
    const k = starts.indexOf(node);
    if (k >= 0) {
      cur = document.createElement('div');
      cur.className = 'fp';
      cur.dataset.page = k;
      cur.setAttribute('aria-label', PAGES[k][1]);
      cur.tabIndex = -1;
      pages.push(cur);
      book.append(cur);
    }
    cur.append(node);
    node = next;
  }
  pages.forEach((p, i) => {
    const body = document.createElement('div');
    body.className = 'fp-body';
    body.append(...p.childNodes);
    p.append(body);
    if (i === pages.length - 1) return;
    // the foot of each page names the next one, like a magazine's running foot
    const n = pages[i + 1].dataset.page;
    const foot = document.createElement('button');
    foot.type = 'button';
    foot.className = 'fp-next';
    foot.innerHTML = `<span class="fpn-k">${String(i + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</span><span class="fpn-to">${PAGES[n][1]} <span aria-hidden="true">↓</span></span>`;
    foot.setAttribute('aria-label', `Next page: ${PAGES[n][1]}`);
    foot.addEventListener('click', () => go(i + 1));
    p.append(foot);
  });

  const pager = document.createElement('nav');
  pager.className = 'pager';
  pager.setAttribute('aria-label', 'Pages');
  pager.innerHTML = `<button type="button" class="pg-b" data-d="-1" aria-label="Previous page">↑</button>
    <span class="pg-n" aria-live="polite"><b>01</b><span>${String(pages.length).padStart(2, '0')}</span></span>
    <button type="button" class="pg-b" data-d="1" aria-label="Next page">↓</button>`;
  document.body.append(pager);
  pager.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) go(index + +b.dataset.d); });

  root.classList.add('flip');
  let index = 0;
  pages[0].classList.add('on');

  const pageOf = el => pages.findIndex(p => p.contains(el));
  const curPage = () => pages[index];
  const atBottom = p => p.scrollTop + p.clientHeight >= p.scrollHeight - 2;
  const atTop = p => p.scrollTop <= 1;
  const blocked = () => root.classList.contains('door-open') || document.querySelector('dialog[open]');

  function paint() {
    pager.querySelector('.pg-n b').textContent = String(index + 1).padStart(2, '0');
    pager.classList.toggle('first', index === 0);
    pager.classList.toggle('last', index === pages.length - 1);
    root.dataset.page = index;
  }

  /* ---------- the turn: one leaf that can be held at any angle, then finished or let go ---------- */
  function half(page, which) {
    const wrap = document.createElement('div');
    wrap.className = `fp-half ${which}`;
    const c = page.cloneNode(true);
    c.classList.add('on', 'fp-clone');
    c.removeAttribute('tabindex');
    c.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    const H = book.clientHeight;
    c.style.height = `${H}px`;
    c.style.top = which === 'top' ? '0' : `${-H / 2}px`;
    wrap.append(c);
    const shade = document.createElement('i');
    shade.className = 'fp-shade';
    wrap.append(shade);
    return [wrap, c, shade];
  }
  let turn = null; // the turn in progress, if any

  function begin(j) {
    if (turn || j < 0 || j >= pages.length || j === index) return null;
    const from = pages[index], to = pages[j], dir = j > index ? 1 : -1;
    to.classList.add('on', 'fp-snap');
    to.scrollTop = dir > 0 ? 0 : to.scrollHeight;
    const leaf = document.createElement('div');
    leaf.className = `fp-leaf ${dir > 0 ? 'lower' : 'upper'}`;
    const [front, fc, fs] = half(from, dir > 0 ? 'bottom' : 'top');
    const [back, bc, bs] = half(to, dir > 0 ? 'top' : 'bottom');
    front.classList.add('front'); back.classList.add('back');
    leaf.append(front, back);
    const under = document.createElement('i');
    under.className = `fp-under ${dir > 0 ? 'lower' : 'upper'}`;
    book.append(under, leaf);
    fc.scrollTop = from.scrollTop; bc.scrollTop = to.scrollTop;
    [[from, fc], [to, bc]].forEach(([a, b]) => {
      const ca = a.querySelectorAll('canvas'), cb = b.querySelectorAll('canvas');
      ca.forEach((cv, k) => { try { cb[k].width = cv.width; cb[k].height = cv.height; cb[k].getContext('2d').drawImage(cv, 0, 0); } catch { /* a blank frame is fine */ } });
    });
    from.style.clipPath = dir > 0 ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)';
    to.style.clipPath = dir > 0 ? 'inset(50% 0 0 0)' : 'inset(0 0 50% 0)';
    root.classList.add('turning');
    const t = { j, dir, from, to, leaf, under, p: 0, anim: 0, done: false };
    // p runs 0 to 1 as the leaf turns through 180 degrees; it darkens as it lifts away from the light
    t.set = p => {
      t.p = p;
      leaf.style.transform = `rotateX(${dir * 180 * p}deg)`;
      fs.style.opacity = Math.min(0.3, p * 0.6).toFixed(3);
      bs.style.opacity = (p < 0.5 ? 0.3 : Math.max(0, 0.3 - (p - 0.5) * 0.6)).toFixed(3);
      under.style.opacity = (0.22 * (1 - p)).toFixed(3);
    };
    t.set(0);
    turn = t;
    return t;
  }
  function tween(t, target, ms) {
    return new Promise(done => {
      const from = t.p, t0 = performance.now();
      const ease = x => 1 - (1 - x) ** 3;
      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        t.set(from + (target - from) * ease(k));
        if (k < 1) t.anim = requestAnimationFrame(step); else done();
      };
      cancelAnimationFrame(t.anim);
      t.anim = requestAnimationFrame(step);
    });
  }
  function cleanup(t) {
    t.from.style.clipPath = ''; t.to.style.clipPath = '';
    t.leaf.remove(); t.under.remove();
    t.to.classList.remove('fp-snap');
    root.classList.remove('turning');
    turn = null;
  }
  async function finish(t, { focus = true } = {}) {
    if (t.done) return;
    t.done = true;
    await tween(t, 1, 240 + 460 * (1 - t.p));
    t.from.classList.remove('on');
    cleanup(t);
    index = t.j;
    paint();
    if (focus) t.to.focus({ preventScroll: true });
    dispatchEvent(new CustomEvent('flip:change', { detail: { index, page: t.to } }));
  }
  async function letGo(t) {
    if (t.done) return;
    t.done = true;
    await tween(t, 0, 160 + 360 * t.p);
    t.to.classList.remove('on');
    cleanup(t);
  }

  async function go(j, { instant = false, focus = true } = {}) {
    if (turn) return;
    if (j < 0 || j >= pages.length || j === index) return;
    if (instant || reduceMotion) {
      const from = pages[index], to = pages[j];
      to.classList.add('on'); to.scrollTop = 0; from.classList.remove('on');
      if (reduceMotion && !instant) to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      index = j; paint();
      if (focus) to.focus({ preventScroll: true });
      dispatchEvent(new CustomEvent('flip:change', { detail: { index, page: to } }));
      return;
    }
    const t = begin(j);
    if (t) await finish(t, { focus });
  }

  function reveal(el, { instant = false } = {}) {
    const j = pageOf(el);
    if (j < 0) return false;
    const inPage = () => { const p = pages[j]; if (p.querySelector('.fp-body').firstElementChild !== el) p.scrollTop += el.getBoundingClientRect().top - (document.querySelector('.topnav')?.offsetHeight || 0); };
    if (j === index) { inPage(); return true; }
    go(j, { instant, focus: false }).then(inPage);
    return true;
  }

  /* ---------- wheel and trackpad: push past the end of a page and the leaf follows ---------- */
  // A push that starts at the end of a page turns it after a short pull. A scroll that only arrives at the end on its
  // way down (momentum included) lifts the leaf a little but needs a lot more to turn it, so reading to the bottom of
  // a page never throws you onto the next one by accident.
  let lastWheel = 0, gesture = null, settle = 0;
  const PULL = 140, PULL_ARRIVING = 560;
  addEventListener('wheel', e => {
    if (blocked() || e.ctrlKey) return;
    if (e.target.closest?.('.receipt, .rc-sheet')) return;
    const p = curPage(), dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy || Math.abs(e.deltaX) > Math.abs(dy)) return;
    const now = performance.now(), fresh = now - lastWheel > 200;
    lastWheel = now;
    if (turn?.done) { e.preventDefault(); return; }
    // over the fixed nav or pager the wheel would scroll nothing: scroll the page under it
    if (!book.contains(e.target) && !turn) p.scrollTop += dy;
    const dir = dy > 0 ? 1 : -1;
    const edge = dir > 0 ? atBottom(p) : atTop(p);
    if (fresh || !gesture) gesture = { dir, startedAtEdge: edge, pull: 0 };
    if (!edge && !turn) { gesture.startedAtEdge = false; return; }
    e.preventDefault();
    if (!turn) { if (!begin(index + dir)) return; gesture.dir = dir; gesture.pull = 0; }
    gesture.pull = Math.max(0, gesture.pull + (dir === turn.dir ? 1 : -1) * Math.abs(dy));
    const k = Math.min(1, gesture.pull / (gesture.startedAtEdge ? PULL : PULL_ARRIVING));
    turn.set(0.32 * (1 - (1 - k) ** 2));
    clearTimeout(settle);
    if (k >= 1) { finish(turn); gesture = null; return; }
    settle = setTimeout(() => { if (turn && !turn.done) letGo(turn); gesture = null; }, 200);
  }, { passive: false });

  /* ---------- touch: at the end of a page, the finger holds the fold ---------- */
  let touch = null;
  addEventListener('touchstart', e => {
    touch = null;
    if (blocked() || turn || e.touches.length !== 1) return;
    const p = curPage();
    touch = { y: e.touches[0].clientY, x: e.touches[0].clientX, bottom: atBottom(p), top: atTop(p), t: null, trail: [] };
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!touch || e.touches.length !== 1) return;
    const y = e.touches[0].clientY, dy = y - touch.y, dx = e.touches[0].clientX - touch.x;
    touch.trail.push([performance.now(), y]); if (touch.trail.length > 5) touch.trail.shift();
    if (!touch.t) {
      if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy)) return;
      const dir = dy < 0 ? 1 : -1;
      if (!(dir > 0 ? touch.bottom : touch.top)) { touch = null; return; }
      touch.t = begin(index + dir);
      if (!touch.t) { touch = null; return; }
      touch.y = y;
    }
    e.preventDefault();
    const span = book.clientHeight * 0.85;
    touch.t.set(Math.max(0, Math.min(0.98, (touch.t.dir > 0 ? touch.y - y : y - touch.y) / span)));
  }, { passive: false });
  addEventListener('touchend', () => {
    const t = touch?.t, L = touch?.trail || [];
    touch = null;
    if (!t) return;
    let v = 0;
    if (L.length > 1) { const [t0, y0] = L[0], [t1, y1] = L[L.length - 1]; v = ((y0 - y1) * t.dir) / Math.max(1, t1 - t0); }
    if (t.p > 0.3 || v > 0.4) finish(t); else letGo(t);
  });

  /* ---------- keys: at the end of a page, the keys that would scroll it turn it ---------- */
  addEventListener('keydown', e => {
    if (blocked() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], [role="tab"], [role="slider"]')) return;
    const p = curPage(), k = e.key;
    const down = k === 'PageDown' || k === 'ArrowDown' || (k === ' ' && !e.shiftKey && !e.target.closest?.('button, a'));
    const up = k === 'PageUp' || k === 'ArrowUp' || (k === ' ' && e.shiftKey);
    if (down && atBottom(p)) { e.preventDefault(); go(index + 1); }
    else if (up && atTop(p)) { e.preventDefault(); go(index - 1); }
    else if (k === 'Home' && !e.target.closest?.('button, a')) { e.preventDefault(); go(0); }
    else if (k === 'End' && !e.target.closest?.('button, a')) { e.preventDefault(); go(pages.length - 1); }
  });

  /* ---------- in-page links and #addresses turn to the right page ---------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const el = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
    if (!el || !book.contains(el)) return;
    e.preventDefault();
    history.replaceState(null, '', a.getAttribute('href'));
    reveal(el);
  });
  addEventListener('hashchange', () => { const el = document.getElementById(location.hash.slice(1)); if (el) reveal(el); });
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target !== first) requestAnimationFrame(() => reveal(target, { instant: true }));
  addEventListener('resize', () => { if (turn && !turn.done) letGo(turn); });

  paint();
  return {
    get index() { return index; },
    get count() { return pages.length; },
    page: () => pages[index],
    pageOf,
    go,
    reveal,
  };
}
