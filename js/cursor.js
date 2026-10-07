// The custom cursor, shared by every page. Mouse and trackpad only; touch keeps the native pointer.
export function initCursor(hoverTargets = 'a,button,[role="tab"]') {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const cur = document.getElementById('cursor');
  const ring = document.getElementById('cursor-ring');
  if (!cur || !ring) return;
  document.documentElement.classList.add('has-cursor');
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, running = false;
  // hidden until the first move, so it never sits in the top-left corner
  cur.style.opacity = ring.style.opacity = '0';

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
    if (cur.style.opacity) { rx = mx; ry = my; cur.style.opacity = ring.style.opacity = ''; }
    if (!running) { running = true; requestAnimationFrame(frame); }
  }, { passive: true });

  // one delegated listener instead of one per element, so new elements work too
  const setHover = on => { cur.classList.toggle('hover', on); ring.classList.toggle('hover', on); };
  document.addEventListener('mouseover', e => setHover(!!e.target.closest(hoverTargets)));
  document.addEventListener('mouseleave', () => setHover(false));
}
