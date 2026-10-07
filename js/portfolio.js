// Portfolio: the door, the work, and the receipt. Progressive enhancement: the page reads fine without it.

import { initReceipt } from './receipt.js';
import { checkRepo, fmtDay } from './live-audit.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const smooth = reduce ? 'auto' : 'smooth';

/* ---------- the door: every visit starts here ---------- */
const bar = $('#bar');
const door = $('#door');
if (!location.hash) scrollTo(0, 0);
let atDoor = true;
new IntersectionObserver(([e]) => {
  atDoor = e.intersectionRatio > 0.4;
  bar.classList.toggle('on-door', atDoor);
}, { threshold: [0, 0.2, 0.4, 0.6, 1] }).observe(door);
addEventListener('scroll', () => bar.classList.toggle('scrolled', scrollY > 8), { passive: true });

const cards = $$('.door-card');
const play = card => { card.classList.remove('play'); void card.offsetWidth; card.classList.add('play'); };
cards.forEach((card, i) => {
  card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
  card.addEventListener('mouseenter', () => play(card));
  setTimeout(() => card.classList.add('play'), reduce ? 0 : 900 + i * 260);
});
$('[data-door="browse"]').addEventListener('click', e => {
  e.preventDefault();
  $('#top').scrollIntoView({ behavior: smooth });
});
$('.mark').addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: smooth }); });
addEventListener('keydown', e => {
  if (!atDoor || e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(document.activeElement?.tagName)) return;
  if (/^[123]$/.test(e.key)) cards[+e.key - 1].click();
});

/* ---------- reveal on scroll ---------- */
const revealer = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
$$('[data-reveal]').forEach(el => revealer.observe(el));

/* ---------- headline numbers count up ---------- */
const counter = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counter.unobserve(e.target);
    const el = e.target, to = parseFloat(el.dataset.count), pre = el.dataset.pre || '', post = el.dataset.post || '';
    const dec = (el.dataset.count.split('.')[1] || '').length;
    if (reduce) continue;
    const t0 = performance.now(), dur = 1300;
    const tick = now => {
      const k = Math.min((now - t0) / dur, 1), v = to * (1 - Math.pow(1 - k, 4));
      el.textContent = pre + v.toFixed(dec) + post;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}, { threshold: 0.6 });
$$('[data-count]').forEach(el => counter.observe(el));

/* ---------- receipt ---------- */
const tabs = $$('.case-tab');
const panels = $$('.case');
let active = 0;
let casesSeen = false;
const receipt = initReceipt({ reduceMotion: reduce, onJump: id => jumpTo(id) });

/* ---------- case tabs ---------- */
function select(i, { focus = false } = {}) {
  active = (i + tabs.length) % tabs.length;
  tabs.forEach((t, j) => {
    const on = j === active;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    panels[j].hidden = !on;
  });
  if (focus) tabs[active].focus();
  tabs[active].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth });
  if (casesSeen) receipt?.print(panels[active]);
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => select(i));
  t.addEventListener('keydown', e => {
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); select(active + k, { focus: true }); }
    if (e.key === 'Home') { e.preventDefault(); select(0, { focus: true }); }
    if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, { focus: true }); }
  });
});
// swipe between cases on touch screens
let sx = null, sy = null;
$('.case-panels').addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { sx = e.clientX; sy = e.clientY; } });
$('.case-panels').addEventListener('pointerup', e => {
  if (sx == null) return;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  sx = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) select(active + (dx < 0 ? 1 : -1));
});

function jumpTo(id) {
  const m = /^case-(\d)$/.exec(id);
  if (!m) return false;
  select(+m[1] - 1);
  $('#work').scrollIntoView({ behavior: smooth, block: 'start' });
  return true;
}
if (location.hash) jumpTo(location.hash.slice(1));
addEventListener('hashchange', () => jumpTo(location.hash.slice(1)));

/* ---------- receipt printing ---------- */
if (receipt) {
  const printer = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { receipt.print(e.target); printer.unobserve(e.target); }
  }, { rootMargin: '0px 0px -30% 0px' });
  $$('[data-r]:not(.case)').forEach(el => printer.observe(el));
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { casesSeen = true; receipt.print(panels[active]); }
  }, { threshold: 0.35 }).observe($('#cases'));
  new IntersectionObserver(([e]) => { if (e.isIntersecting) receipt.approve(); }, { threshold: 0.3 }).observe($('#contact'));
  addEventListener('scroll', () => receipt.setVisible(scrollY > door.offsetHeight * 0.9), { passive: true });
  $('#tldr')?.addEventListener('click', () => { receipt.printAll(); receipt.open(); });
}

/* ---------- project art only animates on screen ---------- */
const artWatch = new IntersectionObserver(entries => {
  for (const e of entries) e.target.classList.toggle('in-view', e.isIntersecting);
}, { threshold: 0.15 });
$$('.project').forEach(p => artWatch.observe(p));

/* ---------- live check: re-verify every repo from the visitor's browser ---------- */
const lc = $('#liveCheck');
if (lc) {
  const once = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return;
    once.disconnect();
    const log = $('#lcLog'), total = $('#lcCommits');
    log.innerHTML = '';
    let sum = 0, fellBack = false;
    const line = (html, cls = '') => { const li = document.createElement('li'); li.className = cls; li.innerHTML = html; log.append(li); return li; };
    for (const box of $$('.p-proof[data-repo]')) {
      const repo = box.dataset.repo;
      const snap = +box.querySelector('[data-live="commits"]').textContent;
      try {
        const r = await checkRepo(repo);
        sum += r.commits;
        box.querySelector('[data-live="commits"]').textContent = r.commits;
        line(`<span class="ok">✓</span><span>${repo} · public · ${r.commits} commits · last push ${fmtDay(r.pushed)}${r.cached ? '' : ` · ${r.ms} ms`}</span>`);
      } catch (err) {
        sum += snap;
        fellBack = true;
        line(`<span class="warn">!</span><span>${repo} · ${err.message}; showing the ${snap}-commit snapshot</span>`);
      }
      total.textContent = sum;
    }
    line(fellBack ? 'Some checks fell back to the snapshot taken 7 Oct 2026.' : `Checked just now, straight from api.github.com.`, 'muted');
  }, { threshold: 0.3 });
  once.observe(lc);
}
