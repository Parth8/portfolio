// Live verification, run in the visitor's own browser against public endpoints.
// Nothing here goes through a server of Parth's, so nothing here can be staged.

const GH = 'https://api.github.com/repos/';
const TTL = 30 * 60 * 1000; // GitHub allows 60 unauthenticated calls an hour per visitor; cache for 30 minutes

const cacheGet = k => { try { const v = JSON.parse(sessionStorage.getItem(k)); return v && Date.now() - v.at < TTL ? v.data : null; } catch { return null; } };
const cacheSet = (k, data) => { try { sessionStorage.setItem(k, JSON.stringify({ at: Date.now(), data })); } catch { /* private mode */ } };

// A repo's public facts: does it exist, when was it made and last pushed, how many commits, by whom.
export async function checkRepo(repo, { signal } = {}) {
  const key = `pa-gh:${repo}`;
  const hit = cacheGet(key);
  if (hit) return { ...hit, cached: true };
  const t0 = performance.now();
  const opts = { signal, headers: { accept: 'application/vnd.github+json' } };
  const [r, c] = await Promise.all([fetch(GH + repo, opts), fetch(`${GH}${repo}/contributors?anon=1&per_page=30`, opts)]);
  if (!r.ok) throw new Error(r.status === 403 || r.status === 429 ? 'GitHub rate limit reached' : `GitHub answered ${r.status}`);
  const meta = await r.json();
  const people = c.ok ? await c.json() : [];
  const data = {
    repo, ms: Math.round(performance.now() - t0), isPublic: !meta.private, created: meta.created_at?.slice(0, 10), pushed: meta.pushed_at?.slice(0, 10),
    commits: people.reduce((s, x) => s + (x.contributions || 0), 0),
    authors: people.map(x => ({ name: x.login || x.name || 'anonymous', commits: x.contributions })),
  };
  cacheSet(key, data);
  return data;
}

// Does a page answer? With no-cors we can't read it, but a resolved request means the host responded.
export async function checkReachable(url, { timeout = 7000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const t0 = performance.now();
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal });
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - t0) };
  } finally { clearTimeout(timer); }
}

export const fmtDay = iso => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m - 1]} ${y}`;
};
