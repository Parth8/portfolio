// node --test tests/   (Node 20+). Exercises server/worker.js exactly as Cloudflare would run it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';

const env = { DATA_URL: '' }; // use the embedded data, no network
const URL_ = 'https://parth-mcp.example.workers.dev/mcp';
let nextId = 1;

async function post(body, headers = {}) {
  const res = await worker.fetch(new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}
const legacy = (method, params = {}, version = '2025-06-18') =>
  post({ jsonrpc: '2.0', id: nextId++, method, params }, { 'mcp-protocol-version': version });
const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
function modern(method, params = {}, extraHeaders = {}) {
  const h = { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method };
  if (method === 'tools/call' || method === 'prompts/get') h['mcp-name'] = params.name;
  if (method === 'resources/read') h['mcp-name'] = params.uri;
  return post({ jsonrpc: '2.0', id: nextId++, method, params: { ...params, _meta: META } }, { ...h, ...extraHeaders });
}

test('legacy: initialize negotiates the requested version and mints no session', async () => {
  const r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude', version: '1' } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.protocolVersion, '2025-06-18');
  assert.ok(r.json.result.capabilities.tools);
  assert.equal(r.json.result.serverInfo.name, 'parth-aggarwal');
  assert.equal(r.headers.get('mcp-session-id'), null);
  const unknown = await post({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
  assert.equal(unknown.json.result.protocolVersion, '2025-11-25', 'falls back to the newest legacy version');
});

test('legacy: initialized notification is accepted with 202 and no body', async () => {
  const r = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, { 'mcp-protocol-version': '2025-06-18' });
  assert.equal(r.status, 202);
  assert.equal(r.json, null);
});

test('legacy: tools/list returns seven read-only tools in a stable order', async () => {
  const r = await legacy('tools/list');
  const names = r.json.result.tools.map(t => t.name);
  assert.deepEqual(names, ['get_profile', 'list_work', 'get_work', 'search_evidence', 'prove_claim', 'fit_for', 'contact']);
  for (const t of r.json.result.tools) {
    assert.equal(t.annotations.readOnlyHint, true);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 40);
  }
  assert.equal(r.json.result.resultType, undefined, 'legacy results carry no modern fields');
});

test('legacy: tools/call returns text + structured content', async () => {
  const r = await legacy('tools/call', { name: 'prove_claim', arguments: { claim: '$2B a year disbursed' } });
  assert.equal(r.json.result.isError, false);
  assert.equal(r.json.result.structuredContent.verdict, 'supported');
  assert.match(r.json.result.content[0].text, /SUPPORTED/);
});

test('legacy: ping, resources and prompts', async () => {
  assert.deepEqual((await legacy('ping')).json.result, {});
  const res = await legacy('resources/read', { uri: 'parth://resume.md' });
  assert.match(res.json.result.contents[0].text, /# Parth Aggarwal/);
  const missing = await legacy('resources/read', { uri: 'parth://nope' });
  assert.equal(missing.json.error.code, -32002);
  const p = await legacy('prompts/get', { name: 'assess_fit', arguments: { job_description: 'Senior PM, payments' } });
  assert.match(p.json.result.messages[0].content.text, /fit_for/);
});

test('legacy: unknown method and unknown tool are JSON-RPC errors', async () => {
  assert.equal((await legacy('nope/nope')).json.error.code, -32601);
  assert.equal((await legacy('tools/call', { name: 'delete_everything', arguments: {} })).json.error.code, -32602);
});

test('tool input errors come back as isError results the model can fix', async () => {
  const r = await legacy('tools/call', { name: 'get_work', arguments: { id: 'mars-rover' } });
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /list_work/);
  const r2 = await legacy('tools/call', { name: 'search_evidence', arguments: { query: 'kafka', limit: 99 } });
  assert.equal(r2.json.result.isError, true);
});

test('modern: server/discover advertises both eras and identifies the server', async () => {
  const r = await modern('server/discover');
  assert.equal(r.status, 200);
  assert.equal(r.json.result.resultType, 'complete');
  assert.ok(r.json.result.supportedVersions.includes('2026-07-28'));
  assert.ok(r.json.result.supportedVersions.includes('2025-06-18'));
  assert.equal(r.json.result._meta['io.modelcontextprotocol/serverInfo'].name, 'parth-aggarwal');
  assert.equal(typeof r.json.result.ttlMs, 'number');
});

test('modern: list results are cacheable; tools/call works with mirrored headers', async () => {
  const l = await modern('tools/list');
  assert.equal(l.json.result.cacheScope, 'public');
  assert.equal(l.json.result.tools.length, 7);
  const c = await modern('tools/call', { name: 'fit_for', arguments: { job_description: 'Senior Product Manager, card issuing: APIs, webhooks, fraud, Mastercard, enterprise banks. 5+ years.' } });
  assert.equal(c.json.result.resultType, 'complete');
  assert.ok(c.json.result.structuredContent.score >= 80);
});

test('modern: header validation (missing, mismatched, base64-encoded)', async () => {
  const missing = await post({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: { _meta: META } }, { 'mcp-protocol-version': '2026-07-28' });
  assert.equal(missing.status, 400);
  assert.equal(missing.json.error.code, -32020);
  const wrongName = await modern('tools/call', { name: 'contact', arguments: {} }, { 'mcp-name': 'get_profile' });
  assert.equal(wrongName.json.error.code, -32020);
  const b64 = await modern('tools/call', { name: 'contact', arguments: {} }, { 'mcp-name': `=?base64?${btoa('contact')}?=` });
  assert.equal(b64.status, 200);
});

test('modern: unsupported version and unknown method', async () => {
  const r = await post({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: { _meta: { ...META, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } } },
    { 'mcp-protocol-version': '2099-01-01', 'mcp-method': 'tools/list' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, -32022);
  assert.ok(r.json.error.data.supported.includes('2026-07-28'));
  const m = await modern('initialize');
  assert.equal(m.status, 404);
  assert.equal(m.json.error.code, -32601);
});

test('transport: GET is 405, batches are 400, bad JSON is -32700, CORS preflight works', async () => {
  const g = await worker.fetch(new Request(URL_, { method: 'GET', headers: { accept: 'text/event-stream' } }), env);
  assert.equal(g.status, 405);
  assert.equal((await post([{ jsonrpc: '2.0', id: 1, method: 'ping' }])).status, 400);
  assert.equal((await post('{not json')).json.error.code, -32700);
  const o = await worker.fetch(new Request(URL_, { method: 'OPTIONS', headers: { origin: 'https://parth8.github.io' } }), env);
  assert.equal(o.status, 204);
  assert.equal(o.headers.get('access-control-allow-origin'), 'https://parth8.github.io');
});

test('security: foreign browser origins are refused; oversized bodies are 413', async () => {
  const bad = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  const local = await post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'http://localhost:6274' });
  assert.equal(local.status, 200);
  const big = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fit_for', arguments: { job_description: 'x'.repeat(70000) } } });
  assert.equal(big.status, 413);
});
