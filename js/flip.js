// Flip: the portfolio reads like a magazine on Flipboard. Each part of the page is its own page; at the end of one,
// scroll (or swipe, or press the arrow key) again and the bottom half folds up over the top to bring in the next.
// Without JavaScript, with ?scroll in the address, or when printing, the page is one long scroll as before.

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

  // group the top-level blocks into pages: each listed section starts a page, everything after it joins until the next
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
  // the fold line at the bottom of every page but the last: it says what is next, and a tap turns the page
  pages.forEach((p, i) => {
    const body = document.createElement('div');
    body.className = 'fp-body';
    body.append(...p.childNodes);
    p.append(body);
    if (i === pages.length - 1) return;
    const n = pages[i + 1].dataset.page;
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'fp-next';
    next.innerHTML = `<span class="fpn-k">Page ${String(i + 1).padStart(2, '0')} of ${pages.length}</span>
      <span class="fpn-hand" aria-hidden="true">scroll again to flip</span>
      <span class="fpn-to">Next · ${PAGES[n][1]} <span aria-hidden="true">↓</span></span>`;
    next.addEventListener('click', () => go(i + 1));
    p.append(next);
  });

  // the pager: where you are, and a way back
  const pager = document.createElement('nav');
  pager.className = 'pager';
  pager.setAttribute('aria-label', 'Pages');
  pager.innerHTML = `<button type="button" class="pg-b" data-d="-1" aria-label="Previous page">↑</button>
    <span class="pg-n" aria-live="polite"><b>01</b><span>${String(pages.length).padStart(2, '0')}</span><i></i></span>
    <button type="button" class="pg-b" data-d="1" aria-label="Next page">↓</button>`;
  document.body.append(pager);
  pager.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) go(index + +b.dataset.d); });

  root.classList.add('flip');
  let index = 0, busy = false;
  pages[0].classList.add('on');

  const pageOf = el => pages.findIndex(p => p.contains(el));
  const cur0 = () => pages[index];
  const atBottom = p => p.scrollTop + p.clientHeight >= p.scrollHeight - 2;
  const atTop = p => p.scrollTop <= 1;
  const blocked = () => root.classList.contains('door-open') || document.querySelector('dialog[open]');

  function paint() {
    const n = pager.querySelector('.pg-n');
    n.querySelector('b').textContent = String(index + 1).padStart(2, '0');
    n.querySelector('i').textContent = PAGES[pages[index].dataset.page][1];
    pager.classList.toggle('first', index === 0);
    pager.classList.toggle('last', index === pages.length - 1);
    root.dataset.page = index;
  }

  // a half of a page, frozen at its current scroll position, for the leaf that folds over
  function half(page, which) {
    const wrap = document.createElement('div');
    wrap.className = `fp-half ${which}`;
    const c = page.cloneNode(true);
    c.classList.add('on', 'fp-clone');
    c.removeAttribute('tabindex');
    c.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    const H = book.clientHeight;
    c.style.height = `${H}px`;
    c.classList.remove('fp-snap');
    c.style.top = which === 'top' ? '0' : `${-H / 2}px`;
    wrap.append(c);
    const shade = document.createElement('i');
    shade.className = 'fp-shade';
    wrap.append(shade);
    return [wrap, c, shade];
  }

  async function go(j, { land = 'top', instant = false, focus = true } = {}) {
    if (busy || j < 0 || j >= pages.length || j === index) return;
    const from = pages[index], to = pages[j], dir = j > index ? 1 : -1;
    busy = true;
    to.classList.add('on');
    to.scrollTop = land === 'bottom' ? to.scrollHeight : 0;
    if (instant) {
      from.classList.remove('on');
    } else if (reduceMotion) {
      to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
      from.classList.remove('on');
    } else {
      // the leaf: the half that moves. Front is this page's half, back is the next page's other half.
      // let the incoming page's reveal animations settle into place before photographing it
      to.classList.add('fp-snap');
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const leaf = document.createElement('div');
      leaf.className = `fp-leaf ${dir > 0 ? 'lower' : 'upper'}`;
      const [front, fc, fs] = half(from, dir > 0 ? 'bottom' : 'top');
      const [back, bc, bs] = half(to, dir > 0 ? 'top' : 'bottom');
      front.classList.add('front'); back.classList.add('back');
      leaf.append(front, back);
      book.append(leaf);
      fc.scrollTop = from.scrollTop; bc.scrollTop = to.scrollTop;
      [[from, fc], [to, bc]].forEach(([a, b]) => {
        const ca = a.querySelectorAll('canvas'), cb = b.querySelectorAll('canvas');
        ca.forEach((cv, k) => { try { cb[k].width = cv.width; cb[k].height = cv.height; cb[k].getContext('2d').drawImage(cv, 0, 0); } catch { /* blank is fine for a frame */ } });
      });
      // the halves that stay still: the real pages, clipped
      from.style.clipPath = dir > 0 ? 'inset(0 0 50% 0)' : 'inset(50% 0 0 0)';
      to.style.clipPath = dir > 0 ? 'inset(50% 0 0 0)' : 'inset(0 0 50% 0)';
      const under = document.createElement('i');
      under.className = `fp-under ${dir > 0 ? 'lower' : 'upper'}`;
      book.append(under);
      const dur = 760, ease = 'cubic-bezier(0.55, 0.06, 0.3, 1)';
      const turn = leaf.animate([{ transform: 'rotateX(0deg)' }, { transform: `rotateX(${dir * 180}deg)` }], { duration: dur, easing: ease, fill: 'forwards' });
      fs.animate([{ opacity: 0 }, { opacity: 0.32 }], { duration: dur / 2, easing: 'ease-in', fill: 'forwards' });
      bs.animate([{ opacity: 0.32 }, { opacity: 0.32, offset: 0.5 }, { opacity: 0 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
      under.animate([{ opacity: 0.25 }, { opacity: 0 }], { duration: dur, easing: 'ease-out', fill: 'forwards' });
      try { await turn.finished; } catch { /* interrupted */ }
      from.classList.remove('on');
      from.style.clipPath = ''; to.style.clipPath = '';
      leaf.remove(); under.remove();
      to.classList.remove('fp-snap');
    }
    index = j;
    paint();
    if (focus) to.focus({ preventScroll: true });
    dispatchEvent(new CustomEvent('flip:change', { detail: { index, page: to } }));
    busy = false;
  }

  // reveal any element: turn to its page, then scroll it into view inside the page
  function reveal(el, { instant = false } = {}) {
    const j = pageOf(el);
    if (j < 0) return false;
    const inPage = () => { const p = pages[j]; if (p.querySelector('.fp-body').firstElementChild !== el) p.scrollTop += el.getBoundingClientRect().top - (document.querySelector('.topnav')?.offsetHeight || 0); };
    if (j === index) { inPage(); return true; }
    go(j, { instant, focus: false }).then(inPage);
    return true;
  }

  // ---------- input ----------
  // wheel: the first scroll reaches the end of a page; a fresh scroll at the end turns it. Momentum never turns a page.
  let lastWheel = 0, gestureAtEdge = false, sum = 0, lockUntil = 0;
  addEventListener('wheel', e => {
    if (blocked() || e.ctrlKey) return;
    const now = performance.now(), p = cur0(), dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (busy || now < lockUntil) { if (Math.abs(dy) > 0) e.preventDefault(); lastWheel = now; return; }
    if (Math.abs(e.deltaX) > Math.abs(dy)) return;
    // over the fixed nav, pager or receipt the wheel would scroll nothing: scroll the page under it
    if (!book.contains(e.target) && !e.target.closest?.('.receipt, .rc-sheet')) p.scrollTop += dy;
    const edge = dy > 0 ? atBottom(p) : atTop(p);
    if (now - lastWheel > 170) { gestureAtEdge = edge; sum = 0; }
    lastWheel = now;
    if (!edge || !gestureAtEdge) return;
    sum += Math.abs(dy);
    if (sum > 40) {
      gestureAtEdge = false; lockUntil = now + 900;
      if (dy > 0) go(index + 1); else go(index - 1, { land: 'bottom' });
    }
  }, { passive: false });

  // touch: a swipe that starts at the end of a page turns it
  let t0 = null;
  addEventListener('touchstart', e => {
    if (blocked() || busy || e.touches.length !== 1) { t0 = null; return; }
    const p = cur0();
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, bottom: atBottom(p), top: atTop(p) };
  }, { passive: true });
  addEventListener('touchend', e => {
    if (!t0 || blocked()) return;
    const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      if (dy < 0 && t0.bottom) go(index + 1);
      else if (dy > 0 && t0.top) go(index - 1, { land: 'bottom' });
    }
    t0 = null;
  }, { passive: true });

  // keys: at the end of a page, the keys that would scroll it turn it instead
  addEventListener('keydown', e => {
    if (blocked() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], [role="tab"], [role="slider"]')) return;
    const p = cur0(), k = e.key;
    const down = k === 'PageDown' || k === 'ArrowDown' || (k === ' ' && !e.shiftKey && !e.target.closest?.('button, a'));
    const up = k === 'PageUp' || k === 'ArrowUp' || (k === ' ' && e.shiftKey);
    if (down && atBottom(p)) { e.preventDefault(); go(index + 1); }
    else if (up && atTop(p)) { e.preventDefault(); go(index - 1, { land: 'bottom' }); }
    else if (k === 'Home' && !e.target.closest?.('button, a')) { e.preventDefault(); go(0); }
    else if (k === 'End' && !e.target.closest?.('button, a')) { e.preventDefault(); go(pages.length - 1); }
  });

  // in-page links: turn to the page that holds the target
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

  // arriving with a #hash lands on its page, without the animation
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target && target !== first) requestAnimationFrame(() => reveal(target, { instant: true }));

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
