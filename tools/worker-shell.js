// The Cloudflare Worker around the shared MCP core: routing, CORS, Origin checks,
// rate limiting and loading the latest career data. Inlined into server/worker.js.
/* global FALLBACK_DATA, handleMcp, SERVER_INFO, SUPPORTED */

const DEFAULT_DATA_URL = 'https://parth8.github.io/portfolio/data/career.json';
const DEFAULT_ORIGINS = ['https://parth8.github.io', 'https://claude.ai', 'https://claude.com', 'https://chatgpt.com', 'https://cursor.com'];
const MAX_BODY = 64 * 1024;
const RATE = { limit: 120, windowMs: 60000 };

let dataCache = { data: FALLBACK_DATA, at: 0 };
const hits = new Map();

async function loadData(env) {
  const url = env.DATA_URL ?? DEFAULT_DATA_URL;
  if (!url) return FALLBACK_DATA;
  if (Date.now() - dataCache.at < 10 * 60000) return dataCache.data;
  try {
    const r = await fetch(url, { cf: { cacheTtl: 600 } });
    if (r.ok) {
      const d = await r.json();
      if (d && d.schema === FALLBACK_DATA.schema) dataCache = { data: d, at: Date.now() };
    }
  } catch { /* keep the last good copy */ }
  if (!dataCache.at) dataCache.at = Date.now() - 9 * 60000; // retry in a minute, not every request
  return dataCache.data;
}

function originAllowed(origin, env) {
  if (!origin) return true; // server-to-server clients (Claude, ChatGPT, Cursor) send no Origin
  const list = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : DEFAULT_ORIGINS;
  if (list.includes('*') || list.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin); // MCP Inspector and local dev
}

function cors(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id, last-event-id',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { n: 1, reset: now + RATE.windowMs }); return false; }
  h.n++;
  if (hits.size > 5000) hits.clear();
  return h.n > RATE.limit;
}

const reply = (status, body, headers) => new Response(body == null ? null : typeof body === 'string' ? body : JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
});

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (!originAllowed(origin, env)) {
      return reply(403, { jsonrpc: '2.0', id: null, error: { code: -32000, message: `Origin ${origin} is not allowed` } });
    }
    const base = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: base });

    if (url.pathname === '/' && request.method === 'GET') {
      return reply(200, { ...SERVER_INFO, mcp: `${url.origin}/mcp`, transport: 'streamable-http', protocolVersions: SUPPORTED,
        howTo: 'Add the mcp URL as a custom connector in Claude, Cursor or ChatGPT. Guide: https://parth8.github.io/portfolio/mcp/' }, base);
    }
    if (url.pathname !== '/mcp') return reply(404, { error: 'Not found. The MCP endpoint is /mcp.' }, base);

    if (limited(request.headers.get('cf-connecting-ip') || 'anon')) {
      return reply(429, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Too many requests; try again in a minute.' } }, { ...base, 'retry-after': '60' });
    }
    const body = request.method === 'POST' ? await request.text() : '';
    if (body.length > MAX_BODY) return reply(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large.' } }, base);

    const data = await loadData(env);
    const res = handleMcp(data, { method: request.method, headers: request.headers, body });
    return reply(res.status, res.body, { ...base, ...res.headers });
  },
};
