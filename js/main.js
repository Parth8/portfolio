// Portfolio interactions. No build step: loaded as a native ES module.
// Everything here is progressive enhancement - the page reads fine without it.

import { initReceipt } from './receipt.js';
import { initCursor } from './cursor.js';
import { initDoor } from './door.js';

const root = document.documentElement;
root.classList.add('js');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
initDoor({ reduceMotion });

/* ---------- custom cursor (mouse and trackpad only) ---------- */
const HOVER_TARGETS = '.door-card,a,button,[role="tab"],.bn-cell,.case-stack span,.project-stack span,.sc-list li,.aw-card,.cert-card,.xp-row,.essay,.chapter,.feature-essay,.stamp,.side-dot,.boss-sticker,.ph-figure,.idx-list a';
initCursor(HOVER_TARGETS);

/* ---------- intersection helpers ---------- */
function watch(selector, { threshold = 0.15, once = false, cls = 'in-view', onEnter } = {}) {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add(cls);
        onEnter?.(e.target);
        if (once) io.unobserve(e.target);
      } else if (!once) {
        e.target.classList.remove(cls);
      }
    }
  }, { threshold });
  els.forEach(el => io.observe(el));
}

let jumpHook = () => false;
const receipt = initReceipt({ reduceMotion, onJump: id => jumpHook(id) });

watch('.reveal', { threshold: 0.05, once: true, cls: 'visible' });
watch('.aw-card', { threshold: 0.1, once: true, cls: 'visible' });
watch('.index', { threshold: 0.2, once: true });
watch('#contact', { threshold: 0.25, onEnter: () => receipt?.approve() });
watch('.writings, .skills-wrap, .quote-section', { threshold: 0.2 });
watch('.case, .project', { threshold: 0.15 });
watch('.bn-cell', { threshold: 0.4, cls: 'counted', onEnter: el => countUp(el.querySelector('[data-count]')) });

// every highlight prints a receipt line once its top passes ~70% of the viewport
// (cases print when the reel shows them - see below)
if (receipt) {
  const printer = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { receipt.print(e.target); printer.unobserve(e.target); }
  }, { rootMargin: '0px 0px -30% 0px' });
  document.querySelectorAll('[data-r]:not(.case)').forEach(el => printer.observe(el));
  document.getElementById('tldr')?.addEventListener('click', () => { receipt.printAll(); receipt.open(); });
}

/* ---------- number scramble (re-runs each time a cell enters) ---------- */
function countUp(el) {
  if (!el) return;
  const target = parseFloat(el.dataset.count);
  const prefix = el.dataset.prefix || '';
  if (reduceMotion) { el.textContent = prefix + target; return; }
  if (el._raf) cancelAnimationFrame(el._raf);
  const dur = 1400, start = performance.now(), scrambleMax = Math.max(target * 20, 99);
  const tick = now => {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    if (p < 0.75) {
      el.textContent = prefix + Math.round(scrambleMax * eased * (0.7 + Math.random() * 0.5));
    } else {
      const settle = (p - 0.75) / 0.25;
      const val = Math.round(target + (scrambleMax - target) * (1 - settle) * 0.15 * (Math.random() - 0.5));
      el.textContent = prefix + Math.max(val, target);
    }
    if (p < 1) el._raf = requestAnimationFrame(tick);
    else { el.textContent = prefix + target; el._raf = null; }
  };
  el._raf = requestAnimationFrame(tick);
}

/* ---------- one scroll loop for everything scroll-driven ---------- */
const floatCta = document.getElementById('floatCta');
const scrollFill = document.getElementById('scrollFill');
const sideNav = document.getElementById('sideNav');
const sideDots = [...document.querySelectorAll('.side-dot')];
const navSections = sideDots.map(d => document.getElementById(d.dataset.target)).filter(Boolean);
const phFig = document.querySelector('.ph-figure');

let reelUpdate = () => {};
let ticking = false;
function onScroll() {
  const y = scrollY, vh = innerHeight;
  const max = root.scrollHeight - vh;

  if (scrollFill) scrollFill.style.height = (max > 0 ? (y / max) * 100 : 0) + '%';

  if (floatCta) floatCta.classList.toggle('visible', y > vh * 0.6 && y + vh < root.scrollHeight - vh);
  receipt?.setVisible(y > vh * 0.6);
  reelUpdate();

  if (sideNav) {
    sideNav.classList.toggle('visible', y > vh * 0.4);
    const trigger = vh * 0.4;
    let active = null;
    for (const sec of navSections) {
      const r = sec.getBoundingClientRect();
      if (r.top <= trigger && r.bottom > trigger) active = sec.id;
    }
    sideDots.forEach(d => d.classList.toggle('active', d.dataset.target === active));
  }

  if (phFig && !reduceMotion) {
    const r = phFig.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh) {
      const t = Math.max(-1, Math.min(1, 1 - ((r.top + r.height / 2) / vh) * 2));
      phFig.style.setProperty('--ph-rot', (-1.2 + t * 1.8).toFixed(2) + 'deg');
      phFig.style.setProperty('--ph-ty', (t * -8).toFixed(1) + 'px');
    }
  }
  ticking = false;
}
const requestScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } };
addEventListener('scroll', requestScroll, { passive: true });
addEventListener('resize', requestScroll, { passive: true });
onScroll();

/* ---------- case reel: scroll is the click ----------
   pinned   (desktop, when a case fits the screen): the stage sticks, scrolling flips the cases
   carousel (phones): swipe between cases, the next one peeks in
   stacked  (anything else): every case visible; tabs jump to them */
const reel = document.getElementById('caseReel');
if (reel) {
  const stage = reel.querySelector('.case-stage');
  const strip = reel.querySelector('.case-panels');
  const tabs = [...reel.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const topnav = document.querySelector('.topnav');
  const navH = () => topnav?.offsetHeight || 0;
  let mode = 'stacked', active = -1, seg = 0;

  const onScreen = () => { const r = reel.getBoundingClientRect(); return r.top < innerHeight * 0.7 && r.bottom > innerHeight * 0.3; };

  const activate = (i, focus = false) => {
    if (i !== active) {
      active = i;
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', i === j); t.tabIndex = i === j ? 0 : -1; });
      panels.forEach((p, j) => { p.classList.toggle('is-active', i === j); p.inert = mode === 'pinned' && i !== j; });
      if (mode !== 'stacked') {
        // replay the chips' entrance so each flip feels like turning a page
        const p = panels[i];
        p.classList.remove('in-view');
        requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('in-view')));
      }
    }
    if (onScreen()) receipt?.print(panels[i]);
    if (focus) tabs[i].focus({ preventScroll: true });
  };

  const goTo = (i, focus = false) => {
    const behavior = reduceMotion ? 'auto' : 'smooth';
    if (mode === 'pinned') {
      scrollTo({ top: reel.getBoundingClientRect().top + scrollY - navH() + i * seg + 2, behavior });
    } else if (mode === 'carousel') {
      strip.scrollTo({ left: panels[i].offsetLeft - parseFloat(getComputedStyle(strip).paddingLeft), behavior });
    } else {
      scrollTo({ top: panels[i].getBoundingClientRect().top + scrollY - navH() - 8, behavior });
    }
    activate(i, focus);
  };

  const layout = () => {
    reel.classList.remove('is-pinned', 'is-carousel');
    reel.style.removeProperty('--reel-h');
    panels.forEach(p => { p.inert = false; });
    if (innerWidth <= 900) {
      mode = 'carousel';
    } else {
      reel.classList.add('is-pinned');                      // measure the stage as it would be pinned
      mode = stage.offsetHeight <= innerHeight - navH() ? 'pinned' : 'stacked';
      if (mode !== 'pinned') reel.classList.remove('is-pinned');
    }
    if (mode === 'carousel') reel.classList.add('is-carousel');
    if (mode === 'pinned') {
      seg = Math.round(innerHeight * 0.6);
      reel.style.setProperty('--nav-h', navH() + 'px');
      reel.style.setProperty('--reel-h', stage.offsetHeight + seg * tabs.length + 'px');
    }
    const keep = Math.max(active, 0);
    active = -1;
    activate(keep);
    reelUpdate();
  };

  reelUpdate = () => {
    if (mode === 'pinned') {
      const y = navH() - reel.getBoundingClientRect().top;
      const p = Math.max(0, Math.min(tabs.length - 0.001, y / seg));
      const i = Math.floor(p);
      tabs.forEach((t, j) => t.style.setProperty('--p', j < i ? 1 : j === i ? (p - i).toFixed(3) : 0));
      activate(i);
    } else if (mode === 'stacked') {
      let i = 0;
      panels.forEach((p, j) => { if (p.getBoundingClientRect().top < innerHeight * 0.5) i = j; });
      activate(i);
    } else if (onScreen()) {
      receipt?.print(panels[active]);
    }
  };

  strip.addEventListener('scroll', () => {
    if (mode !== 'carousel') return;
    const step = panels[1].offsetLeft - panels[0].offsetLeft;
    activate(Math.max(0, Math.min(tabs.length - 1, Math.round(strip.scrollLeft / step))));
  }, { passive: true });

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => goTo(i));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); goTo((i + k + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { e.preventDefault(); goTo(0, true); }
      if (e.key === 'End') { e.preventDefault(); goTo(tabs.length - 1, true); }
    });
  });

  jumpHook = id => {
    const i = panels.findIndex(p => p.id === id);
    if (i < 0) return false;
    goTo(i);
    return true;
  };

  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 150); });
  document.fonts?.ready.then(layout);
  layout();
}

/* ---------- built: tiles open into the full story, one at a time ---------- */
const tiles = [...document.querySelectorAll('.project[data-project]')];
// tell people what the click costs: "Read the story · 1 min"
const readLabel = tile => {
  const words = tile.querySelector('.project-desc')?.textContent.trim().split(/\s+/).length || 0;
  return `Read the story · ${Math.max(1, Math.round(words / 200))} min`;
};
const setOpen = (tile, on) => {
  tile.classList.toggle('open', on);
  const btn = tile.querySelector('.project-toggle');
  btn.setAttribute('aria-expanded', on);
  btn.querySelector('.pt-label').textContent = on ? 'Close the story' : readLabel(tile);
};
tiles.forEach(tile => { const l = tile.querySelector('.pt-label'); if (l) l.textContent = readLabel(tile); });
tiles.forEach(tile => {
  tile.querySelector('.project-toggle')?.addEventListener('click', () => {
    const opening = !tile.classList.contains('open');
    const apply = () => {
      tiles.forEach(t => t !== tile && t.classList.contains('open') && setOpen(t, false));
      setOpen(tile, opening);
    };
    const settle = () => {
      const top = tile.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.5) tile.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    };
    apply();
    // let the layout settle (the story unfolds over ~0.5s) before bringing the tile into view
    setTimeout(settle, reduceMotion ? 0 : 120);
  });
});

/* ---------- journey: long roles show three bullets until asked ---------- */
document.querySelectorAll('.xp-row').forEach(row => {
  const extra = row.querySelectorAll('.xp-pts li').length - 3;
  if (extra < 1) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'xp-more';
  btn.setAttribute('aria-expanded', 'false');
  const label = () => row.classList.contains('open') ? '− Show less' : `+ ${extra} more`;
  btn.textContent = label();
  btn.addEventListener('click', () => {
    row.classList.toggle('open');
    btn.setAttribute('aria-expanded', row.classList.contains('open'));
    btn.textContent = label();
  });
  row.querySelector('.xp-right').append(btn);
});

/* ---------- marquee: duplicate the strip once for a seamless loop ---------- */
document.querySelectorAll('.sw-marquee').forEach(m => {
  [...m.children].forEach(c => {
    const copy = c.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    m.append(copy);
  });
});

/* ---------- small delights ---------- */
document.querySelectorAll('.sc-list li').forEach(li => {
  li.style.setProperty('--hover-c', Math.random() > 0.5 ? 'var(--neon)' : 'var(--pink)');
});

const originalTitle = document.title;
const awayTitles = ['👀 come back', 'missing you already', 'parth is still here', 'wait wait wait', "don't leave yet"];
let awayIndex = 0;
document.addEventListener('visibilitychange', () => {
  document.title = document.hidden ? awayTitles[awayIndex++ % awayTitles.length] : originalTitle;
});
