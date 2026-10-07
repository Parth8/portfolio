// The door: every visit opens on a choice of three ways in.
// The portfolio lifts the door like a shutter; the other two navigate. Links with a #hash skip it (see index.html).

export function initDoor({ reduceMotion = false } = {}) {
  const root = document.documentElement;
  const door = document.getElementById('door');
  if (!door) return;
  if (!root.classList.contains('door-open')) { door.remove(); return; }

  const cards = [...door.querySelectorAll('.door-card')];
  let done = false;

  // entry: once each card has landed, hand its transform back to hover; then play the little scenes
  cards.forEach((card, i) => {
    card.addEventListener('animationend', e => { if (e.animationName === 'cardIn') card.classList.add('in'); });
    setTimeout(() => card.classList.add('play'), reduceMotion ? 0 : 1300 + i * 250);
    card.addEventListener('mouseenter', () => { card.classList.remove('play'); void card.offsetWidth; card.classList.add('play'); });
  });

  function close() {
    root.classList.remove('door-open');
    door.hidden = true;
    removeEventListener('keydown', onKey);
    removeEventListener('wheel', onWheel);
    removeEventListener('touchstart', onTouchStart);
    removeEventListener('touchmove', onTouchMove);
  }
  function portfolio() {
    if (done) return;
    done = true;
    scrollTo(0, 0);
    if (reduceMotion) { close(); return; }
    door.classList.add('lift');
    // let the hero start rising while the shutter clears the top of the screen
    setTimeout(() => root.classList.remove('door-open'), 550);
    setTimeout(close, 1000);
  }
  function leaveFor(card) {
    if (done) return;
    done = true;
    card.classList.add('picked');
    door.classList.add('leaving');
    setTimeout(() => { location.href = card.href; }, reduceMotion ? 0 : 380);
  }
  const choose = card => (card.dataset.door === 'portfolio' ? portfolio() : leaveFor(card));

  door.addEventListener('click', e => {
    const t = e.target.closest('[data-door]');
    if (!t) return;
    e.preventDefault();
    if (t.classList.contains('door-card')) choose(t); else portfolio();
  });
  function onKey(e) {
    if (done || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[123]$/.test(e.key)) { e.preventDefault(); choose(cards[+e.key - 1]); }
    else if (['Escape', 'ArrowDown', 'PageDown', ' '].includes(e.key) && !e.target.closest?.('.door-card, button')) { e.preventDefault(); portfolio(); }
    else if (e.key === 'Escape') portfolio();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = cards.indexOf(document.activeElement);
      const next = cards[(Math.max(i, 0) + (e.key === 'ArrowRight' ? 1 : cards.length - 1)) % cards.length];
      next.focus();
    }
  }
  // "or just scroll": a firm scroll down at the top of the door means "show me the portfolio"
  let wheelSum = 0;
  function onWheel(e) {
    if (done) return;
    if (door.scrollHeight > door.clientHeight + 4 && door.scrollTop + door.clientHeight < door.scrollHeight - 4) return; // let a tall door scroll first
    wheelSum = Math.max(0, wheelSum + e.deltaY);
    if (wheelSum > 120) portfolio();
  }
  let ty = null;
  const onTouchStart = e => { ty = e.touches[0].clientY; };
  function onTouchMove(e) {
    if (done || ty == null) return;
    const atBottom = door.scrollTop + door.clientHeight >= door.scrollHeight - 4;
    if (atBottom && ty - e.touches[0].clientY > 90) portfolio();
  }
  addEventListener('keydown', onKey);
  addEventListener('wheel', onWheel, { passive: true });
  addEventListener('touchstart', onTouchStart, { passive: true });
  addEventListener('touchmove', onTouchMove, { passive: true });

  // coming back with the Back button restores this page from memory: show the portfolio, not a half-closed door
  addEventListener('pageshow', e => { if (e.persisted && done) { door.classList.remove('lift', 'leaving'); close(); } });
}
