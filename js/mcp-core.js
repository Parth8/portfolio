// MCP protocol core for "Parth, as an MCP".
// A dual-era Streamable HTTP server as a pure function: (data, HTTP request) -> HTTP response.
//   modern (2026-07-28): stateless, per-request _meta, server/discover, mirrored headers validated
//   legacy (2025-11-25 / 2025-06-18 / 2025-03-26): initialize handshake, no session id minted
// The Cloudflare Worker wraps this unchanged; the /mcp page runs it in the browser.

import { getProfile, listWork, getWork, searchEvidence, proveClaim, fitFor, contact, resumeMarkdown } from './career-engine.js';

export const MODERN = ['2026-07-28'];
export const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const SUPPORTED = [...MODERN, ...LEGACY];
const META = 'io.modelcontextprotocol/';

export const SERVER_INFO = { name: 'parth-aggarwal', title: 'Parth Aggarwal - career record', version: '1.0.0', websiteUrl: 'https://parth8.github.io/portfolio/mcp/' };

export const INSTRUCTIONS = [
  "This server is Parth Aggarwal's own professional record: Technical Platform Product Manager, currently Forward Deployed PM at Backbase (agentic AI connectors for banks); before that, card issuing and data platforms at Zeta.",
  'Every tool is read-only and returns first-party facts with links to their source on his portfolio. Cite those links.',
  'Use fit_for for a job description, prove_claim before repeating any number, search_evidence for "has he done X?", get_work for depth on one item.',
  "Every record carries a proof tier: verified (public artifact), corroborated (public sources confirm the program; role and figures from his resume) or self-reported (resume only). Pass the tier on; don't upgrade it.",
  "If the evidence doesn't cover something, say so plainly rather than inferring it.",
].join(' ');

const CAPABILITIES = { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } };
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/* ---------- tools ---------- */
export const TOOLS = [
  {
    name: 'get_profile', title: 'Profile',
    description: 'Who Parth is right now: current role, location, availability, years of experience, headline results and links. Call this first if you know nothing about him.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_work', title: 'List work',
    description: 'List his case studies, roles and side projects with one-line summaries, headline metrics and ids to pass to get_work.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['all', 'cases', 'roles', 'projects'], default: 'all', description: 'Which records to list.' } }, additionalProperties: false },
  },
  {
    name: 'get_work', title: 'Get one case, role or project',
    description: 'Full detail for one case study, role or side project: what he did, results with numbers, stack, and a link to the source. Accepts an id from list_work (e.g. "connector-studio", "zeta-tpgm", "track") or a name ("Optum", "Sparrow Card").',
    inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 120, description: 'An id from list_work, or a name.' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'search_evidence', title: 'Search the record',
    description: 'Search every line of his record for a topic, skill, tool or company (e.g. "idempotency", "Kafka", "fraud", "MCP", "Mastercard"). Returns ranked quotes with source and link. Use it to answer "has he done X?" with evidence.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300, description: 'Words to look for.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 8, description: 'Maximum quotes to return.' },
      },
      required: ['query'], additionalProperties: false,
    },
  },
  {
    name: 'prove_claim', title: 'Check a claim',
    description: 'Check one specific claim about him against the record, e.g. "0 P1/P2 defects", "$2B a year", "built an MCP in 6 weeks". Returns supported, partial, differs (different numbers on record), not_found or not_supported, with the exact quotes. Use before repeating a figure.',
    inputSchema: { type: 'object', properties: { claim: { type: 'string', minLength: 2, maxLength: 400, description: 'The claim to check, in plain words.' } }, required: ['claim'], additionalProperties: false },
  },
  {
    name: 'fit_for', title: 'Fit for a role',
    description: 'Score his fit for a job description. Detects the requirements, maps each to evidence with links, lists honest gaps, notes experience or level mismatches, and suggests interview questions. Paste the whole job description, not just the title.',
    inputSchema: { type: 'object', properties: { job_description: { type: 'string', minLength: 10, maxLength: 20000, description: 'The full job description text.' } }, required: ['job_description'], additionalProperties: false },
  },
  {
    name: 'contact', title: 'Contact',
    description: "How to reach him and what he's open to. Use when the user wants to get in touch, asks about availability, or wants the resume.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
].map(t => ({ ...t, annotations: { title: t.title, ...READ_ONLY } }));

class ToolInputError extends Error {}
const str = (v, name, max) => {
  if (typeof v !== 'string' || !v.trim()) throw new ToolInputError(`"${name}" is required and must be a non-empty string.`);
  if (v.length > max) throw new ToolInputError(`"${name}" is too long (max ${max} characters).`);
  return v.trim();
};
const link = r => `[${r.title}](${r.url})`;

const RENDER = {
  get_profile: p => [
    `**${p.name}** - ${p.headline}`,
    `Now: ${p.current.title}, ${p.current.company} (since ${p.current.since}). ${p.current.focus}`,
    `Location: ${p.location}. ${p.open_to} ${p.travel}`,
    `Experience: ${p.experience}`, '', p.summary, '',
    'Headline results:', ...p.headline_numbers.map(n => `- ${n.value} ${n.label}`), '',
    `Portfolio: ${p.links.portfolio} · LinkedIn: ${p.links.linkedin}`,
  ].join('\n'),
  list_work: list => list.map(r => `- \`${r.id}\` (${r.kind}) ${link(r)}${r.period ? `, ${r.period}` : ''}${r.metric ? ` - ${r.metric}` : ''}\n  ${r.summary}`).join('\n'),
  get_work: w => [
    `## ${w.title}`, `${w.org}${w.period ? ` · ${w.period}` : ''} · ${w.url}`,
    w.metric ? `**${w.metric.value}** ${w.metric.label}` : '', '', w.summary, '',
    ...w.evidence.map(e => `- ${e}`), '', w.stack ? `Stack: ${w.stack.join(', ')}` : '',
    '', w.proof_note, ...w.sources.filter(x => x.id !== 'resume').map(x => `- ${x.title} (${x.publisher || x.kind}${x.date ? `, ${x.date}` : ''}): ${x.url}\n  Proves: ${x.proves}${x.doesnt ? `\n  Does not prove: ${x.doesnt}` : ''}${x.note ? `\n  Note: ${x.note}` : ''}`),
  ].filter(x => x !== undefined).join('\n'),
  search_evidence: res => res.length ? res.map(r => `- "${r.quote}" - ${link(r)} [${r.proof}]`).join('\n') : 'No matching evidence in the record.',
  prove_claim: p => [`**${p.verdict.toUpperCase()}** - ${p.explanation}`, ...p.evidence.map(e => `- "${e.quote}" - ${link(e)} [${e.proof}]`),
    ...(p.sources || []).filter(x => x.id !== 'resume').map(x => `- Public source: ${x.title} (${x.publisher || x.kind}): ${x.url} - proves: ${x.proves}${x.doesnt ? ` Does not prove: ${x.doesnt}` : ''}`)].join('\n'),
  fit_for: f => f.score == null ? f.message : [
    `**Fit: ${f.score}/100 (${f.band})**${f.title ? ` for ${f.title}` : ''} · range ${f.range.low}-${f.range.high} depending on how much you trust his resume`,
    `Evidence behind it: ${f.evidence_mix.verified} verified, ${f.evidence_mix.corroborated} corroborated, ${f.evidence_mix.self} self-reported records.`, '',
    'Requirements, with confidence (0-1) and why:',
    ...[...f.matches, ...f.gaps].map(m => [
      `- **${m.label}**: ${m.confidence} (${m.band})${m.evidence[0] ? ` - "${m.evidence[0].quote}" ${link(m.evidence[0])} [${m.evidence[0].proof}]` : ''}`,
      ...m.reasons.map(x => `  - ${x}`), `  - Math: ${m.math}`, ...(m.note && m.confidence < 0.4 ? [`  - On record: ${m.note}`] : []),
    ].join('\n')),
    ...(f.notes.length ? ['', ...f.notes.map(n => `Note: ${n}`)] : []),
    '', 'Read first:', ...f.read_first.map(r => `- ${link(r)}${r.metric ? ` - ${r.metric}` : ''} [${r.proof}]`),
    '', 'Questions to ask him:', ...f.questions.map(q => `- ${q}`),
    '', `Method: ${f.method}`,
  ].join('\n'),
  contact: c => [`Email: ${c.email}`, `LinkedIn: ${c.linkedin}`, `Portfolio: ${c.portfolio}`, `Resume: ${c.resume}`, `Open to: ${c.open_to}`, `Based in: ${c.location}`, c.preferred].join('\n'),
};

export function callTool(data, name, args = {}) {
  const run = {
    get_profile: () => getProfile(data),
    list_work: () => {
      const kind = args.kind ?? 'all';
      if (!['all', 'cases', 'roles', 'projects'].includes(kind)) throw new ToolInputError('"kind" must be one of all, cases, roles, projects.');
      return listWork(data, kind);
    },
    get_work: () => {
      const id = str(args.id, 'id', 120);
      const w = getWork(data, id);
      if (!w) throw new ToolInputError(`Nothing called "${id}". Call list_work for valid ids.`);
      return w;
    },
    search_evidence: () => {
      const limit = args.limit ?? 8;
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ToolInputError('"limit" must be an integer from 1 to 20.');
      return searchEvidence(data, str(args.query, 'query', 300), limit);
    },
    prove_claim: () => proveClaim(data, str(args.claim, 'claim', 400)),
    fit_for: () => fitFor(data, str(args.job_description, 'job_description', 20000)),
    contact: () => contact(data),
  }[name];
  if (!run) return null; // unknown tool: the caller turns this into a protocol error
  try {
    const result = run();
    // wrap arrays so structuredContent is always an object
    const structured = Array.isArray(result) ? { results: result } : result;
    return { content: [{ type: 'text', text: RENDER[name](result) }], structuredContent: structured, isError: false };
  } catch (e) {
    if (e instanceof ToolInputError) return { content: [{ type: 'text', text: e.message }], isError: true };
    throw e;
  }
}

/* ---------- resources ---------- */
export const RESOURCES = [
  { uri: 'parth://resume.md', name: 'resume', title: 'Resume (markdown)', description: 'His full record as a plain resume.', mimeType: 'text/markdown' },
  { uri: 'parth://profile.json', name: 'profile', title: 'Profile (JSON)', description: 'Current role, location, availability and headline results.', mimeType: 'application/json' },
  { uri: 'parth://career.json', name: 'career', title: 'Full career record (JSON)', description: 'Everything this server knows: cases, roles, projects, competencies with evidence.', mimeType: 'application/json' },
];
function readResource(data, uri) {
  const text = {
    'parth://resume.md': () => resumeMarkdown(data),
    'parth://profile.json': () => JSON.stringify(getProfile(data), null, 2),
    'parth://career.json': () => JSON.stringify(data, null, 2),
  }[uri];
  if (!text) return null;
  return { contents: [{ uri, mimeType: RESOURCES.find(r => r.uri === uri).mimeType, text: text() }] };
}

/* ---------- prompts ---------- */
export const PROMPTS = [
  { name: 'assess_fit', title: 'Assess fit for a role', description: 'Evaluate Parth for a job description with evidence and honest gaps.',
    arguments: [{ name: 'job_description', description: 'The full job description', required: true }] },
  { name: 'interview', title: 'Interview Parth', description: 'Run a structured, evidence-based interview of his record.',
    arguments: [{ name: 'focus', description: 'Optional focus, e.g. "payments", "AI platforms", "leadership"', required: false }] },
  { name: 'tldr', title: 'TL;DR', description: 'Five bullets on who he is and what he has shipped, with links.', arguments: [] },
];
function getPrompt(name, args = {}) {
  const msg = text => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });
  if (name === 'assess_fit') {
    if (!args.job_description) return { error: 'Missing required argument "job_description".' };
    return { description: 'Assess fit for a role', ...msg(`Assess Parth Aggarwal's fit for the role below using the parth-aggarwal tools. Call fit_for with the full description. Then use prove_claim on the two or three claims that matter most for this role, and search_evidence for any requirement the score did not cover. Give a verdict, the strongest evidence with links, honest gaps, and three questions to ask him.\n\nJob description:\n${args.job_description}`) };
  }
  if (name === 'interview') {
    return { description: 'Interview Parth', ...msg(`Interview Parth Aggarwal's record${args.focus ? ` with a focus on ${args.focus}` : ''} using the parth-aggarwal tools. Start with get_profile and list_work, go deep on the two most relevant items with get_work, and check every number you repeat with prove_claim. Finish with what you would still want to ask him in person.`) };
  }
  if (name === 'tldr') return { description: 'TL;DR', ...msg('Using the parth-aggarwal tools (get_profile, list_work), give five bullets on who Parth Aggarwal is and what he has shipped, each with a link to the source.') };
  return null;
}

/* ---------- JSON-RPC over Streamable HTTP ---------- */
const json = (status, body, extra = {}) => ({ status, headers: { 'content-type': 'application/json', ...extra }, body: body == null ? null : JSON.stringify(body) });
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: data === undefined ? { code, message } : { code, message, data } });
const decodeHeader = v => {
  const m = typeof v === 'string' && v.match(/^=\?base64\?(.*)\?=$/);
  if (!m) return v;
  try { return new TextDecoder().decode(Uint8Array.from(atob(m[1]), c => c.charCodeAt(0))); } catch { return null; }
};
const header = (headers, name) => (typeof headers?.get === 'function' ? headers.get(name) : headers?.[name] ?? headers?.[name.toLowerCase()]) ?? null;

function dispatch(data, method, params, era) {
  const modern = era === 'modern';
  const list = r => (modern ? { ...r, ttlMs: 600000, cacheScope: 'public' } : r);
  switch (method) {
    case 'server/discover':
      return { result: { supportedVersions: SUPPORTED, capabilities: CAPABILITIES, instructions: INSTRUCTIONS, ...(modern ? { ttlMs: 3600000, cacheScope: 'public' } : { serverInfo: SERVER_INFO }) } };
    case 'tools/list': return { result: list({ tools: TOOLS }) };
    case 'tools/call': {
      if (!params || typeof params.name !== 'string') return { error: [-32602, 'tools/call needs params.name'] };
      if (params.arguments != null && (typeof params.arguments !== 'object' || Array.isArray(params.arguments))) return { error: [-32602, 'params.arguments must be an object'] };
      const r = callTool(data, params.name, params.arguments || {});
      return r ? { result: r } : { error: [-32602, `Unknown tool: ${params.name}`] };
    }
    case 'resources/list': return { result: list({ resources: RESOURCES }) };
    case 'resources/templates/list': return { result: list({ resourceTemplates: [] }) };
    case 'resources/read': {
      const r = params && readResource(data, params.uri);
      return r ? { result: modern ? list(r) : r } : { error: [modern ? -32602 : -32002, `Resource not found: ${params?.uri}`] };
    }
    case 'prompts/list': return { result: list({ prompts: PROMPTS }) };
    case 'prompts/get': {
      const p = params && getPrompt(params.name, params.arguments || {});
      if (!p) return { error: [-32602, `Unknown prompt: ${params?.name}`] };
      if (p.error) return { error: [-32602, p.error] };
      return { result: p };
    }
    default: return null;
  }
}

/**
 * Handle one HTTP request to the MCP endpoint.
 * @param {object} data   parsed data/career.json
 * @param {{method:string, headers:Headers|object, body:string}} req
 * @returns {{status:number, headers:object, body:string|null}}
 */
export function handleMcp(data, req) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    return json(405, rpcError(null, -32000, 'Method not allowed. POST JSON-RPC messages to this endpoint.'), { allow: 'POST, OPTIONS' });
  }
  if (req.method !== 'POST') return json(405, rpcError(null, -32000, 'Method not allowed.'), { allow: 'POST, OPTIONS' });

  let msg;
  try { msg = JSON.parse(req.body); } catch { return json(400, rpcError(null, -32700, 'Parse error: body must be one JSON-RPC message.')); }
  if (Array.isArray(msg)) return json(400, rpcError(null, -32600, 'Batch requests are not supported; send one message per POST.'));
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.jsonrpc === '2.0' && ('result' in msg || 'error' in msg)) return json(202, null); // a client response: nothing to do
    return json(400, rpcError(msg?.id, -32600, 'Invalid request: expected a JSON-RPC 2.0 request or notification.'));
  }
  const { id, method } = msg;
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
  const isNotification = !('id' in msg);
  const meta = params._meta || {};
  const version = meta[`${META}protocolVersion`];
  const headerVersion = header(req.headers, 'mcp-protocol-version');

  /* ---- modern: every request carries its version in _meta ---- */
  if (version !== undefined) {
    if (!MODERN.includes(version)) {
      return json(400, rpcError(id, -32022, 'Unsupported protocol version', { supported: SUPPORTED, requested: version }));
    }
    const mismatch = why => json(400, rpcError(id, -32020, `Header mismatch: ${why}`));
    if (headerVersion !== version) return mismatch(`MCP-Protocol-Version header ${headerVersion ? `'${headerVersion}'` : 'is missing'}; body says '${version}'`);
    if (!isNotification) {
      const hm = header(req.headers, 'mcp-method');
      if (hm !== method) return mismatch(`Mcp-Method header ${hm ? `'${hm}'` : 'is missing'}; body says '${method}'`);
      if (['tools/call', 'resources/read', 'prompts/get'].includes(method)) {
        const want = method === 'resources/read' ? params.uri : params.name;
        const hn = decodeHeader(header(req.headers, 'mcp-name'));
        if (hn !== want) return mismatch(`Mcp-Name header ${hn ? `'${hn}'` : 'is missing'}; body says '${want}'`);
      }
    }
    if (isNotification) return json(202, null);
    const out = dispatch(data, method, params, 'modern');
    if (!out) return json(404, rpcError(id, -32601, `Method not found: ${method}`));
    if (out.error) return json(200, rpcError(id, out.error[0], out.error[1]));
    return json(200, { jsonrpc: '2.0', id, result: { resultType: 'complete', ...out.result, _meta: { ...(out.result._meta || {}), [`${META}serverInfo`]: SERVER_INFO } } });
  }

  /* ---- legacy: initialize handshake, then plain requests (no session minted) ---- */
  if (method === 'initialize') {
    const requested = params.protocolVersion;
    const negotiated = LEGACY.includes(requested) ? requested : LEGACY[0];
    return json(200, { jsonrpc: '2.0', id, result: { protocolVersion: negotiated, capabilities: CAPABILITIES, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS } });
  }
  if (headerVersion && !LEGACY.includes(headerVersion)) {
    return MODERN.includes(headerVersion)
      ? json(400, rpcError(id, -32020, `Header mismatch: MCP-Protocol-Version is '${headerVersion}' but the body has no _meta protocol version.`))
      : json(400, rpcError(id, -32022, 'Unsupported protocol version', { supported: SUPPORTED, requested: headerVersion }));
  }
  if (isNotification) return json(202, null);
  if (method === 'ping') return json(200, { jsonrpc: '2.0', id, result: {} });
  const out = dispatch(data, method, params, 'legacy');
  if (!out) return json(200, rpcError(id, -32601, `Method not found: ${method}`));
  if (out.error) return json(200, rpcError(id, out.error[0], out.error[1]));
  return json(200, { jsonrpc: '2.0', id, result: out.result });
}
