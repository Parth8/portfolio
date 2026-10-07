// Portfolio interactions. No build step: loaded as a native ES module.
// Everything here is progressive enhancement - the page reads fine without it.

const root = document.documentElement;
root.classList.add('js');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- custom cursor (mouse and trackpad only) ---------- */
const HOVER_TARGETS = 'a,button,[role="tab"],.bn-cell,.case-stack span,.project-stack span,.sc-list li,.aw-card,.cert-card,.xp-row,.essay,.chapter,.feature-essay,.stamp,.side-dot,.boss-sticker,.ph-figure,.idx-list a';

if (finePointer) {
  const cur = document.getElementById('cursor');
  const ring = document.getElementById('cursor-ring');
  root.classList.add('has-cursor');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, running = false;

  const frame = () => {
    cur.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    rx += (mx - rx) * 0.14;
    ry += (my - ry) * 0.14;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
    // stop the loop once the ring has caught up; the next mousemove restarts it
    if (Math.abs(mx - rx) > 0.1 || Math.abs(my - ry) > 0.1) requestAnimationFrame(frame);
    else running = false;
  };
  addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (!running) { running = true; requestAnimationFrame(frame); }
  }, { passive: true });

  // one delegated listener instead of one per element, so new elements work too
  const setHover = on => { cur.classList.toggle('hover', on); ring.classList.toggle('hover', on); };
  document.addEventListener('mouseover', e => setHover(!!e.target.closest(HOVER_TARGETS)));
  document.addEventListener('mouseleave', () => setHover(false));
}

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

watch('.reveal', { threshold: 0.05, once: true, cls: 'visible' });
watch('.aw-card', { threshold: 0.1, once: true, cls: 'visible' });
watch('.index', { threshold: 0.2, once: true });
watch('#contact', { threshold: 0.25 });
watch('.writings, .skills-wrap, .quote-section', { threshold: 0.2 });
watch('.case, .project', { threshold: 0.15 });
watch('.bn-cell', { threshold: 0.4, cls: 'counted', onEnter: el => countUp(el.querySelector('[data-count]')) });

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

let ticking = false;
function onScroll() {
  const y = scrollY, vh = innerHeight;
  const max = root.scrollHeight - vh;

  if (scrollFill) scrollFill.style.height = (max > 0 ? (y / max) * 100 : 0) + '%';

  if (floatCta) floatCta.classList.toggle('visible', y > vh * 0.6 && y + vh < root.scrollHeight - vh);

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

/* ---------- case study tabs ---------- */
const tablist = document.querySelector('.case-tabs');
if (tablist) {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(t => document.getElementById(t.getAttribute('aria-controls')));
  const select = (i, focus) => {
    tabs.forEach((t, j) => {
      const on = i === j;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      panels[j].hidden = !on;
      if (on) {
        // replay the panel's entrance so switching feels like turning a page
        panels[j].classList.remove('in-view');
        requestAnimationFrame(() => requestAnimationFrame(() => panels[j].classList.add('in-view')));
      }
    });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (k) { e.preventDefault(); select((i + k + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { e.preventDefault(); select(0, true); }
      if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
    });
  });
  select(0);
}

/* ---------- built: tiles open into the full story, one at a time ---------- */
const tiles = [...document.querySelectorAll('.project[data-project]')];
const setOpen = (tile, on) => {
  tile.classList.toggle('open', on);
  const btn = tile.querySelector('.project-toggle');
  btn.setAttribute('aria-expanded', on);
  btn.querySelector('.pt-label').textContent = on ? 'Close the story' : 'Read the story';
};
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
