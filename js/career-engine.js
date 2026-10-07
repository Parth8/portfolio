// Career evidence engine.
// Pure functions over data/career.json - no DOM, no network - so the same code runs in the
// "For you" page, the in-browser MCP console and the Cloudflare Worker (inlined at build time).

// Parth's own assessment of each competency. It can only LOWER a confidence score (see CAP), never raise it.
export const STRENGTH = { core: 1, strong: 0.85, working: 0.6, adjacent: 0.3, gap: 0 };
const STRENGTH_LABEL = { core: 'Core strength', strong: 'Strong', working: 'Working knowledge', adjacent: 'Adjacent', gap: 'Gap' };

/* Confidence: how strongly his own record evidences a requirement.
   Nothing is checked against the web: much of the work is internal to employers. Instead every score
   cites the exact lines it rests on, and says how it got from those lines to the number. */
const K = 0.75;          // one strong, direct piece of evidence alone reaches 0.75: "Strong" needs a second place
const CAP = { gap: 0.15, adjacent: 0.45, working: 0.7 };
const CEILING = 0.97;    // nothing on a portfolio is certain
export const BANDS = [[0.85, 'Strong'], [0.65, 'Good'], [0.4, 'Some'], [0.01, 'Thin'], [0, 'None']];
export const bandOf = c => BANDS.find(([min]) => c >= min)[1];
export const FIT_BANDS = [[85, 'Excellent'], [72, 'Strong'], [58, 'Fair'], [0, 'Stretch']];
const OWNED = /^(owned|own|led|lead|architected|rearchitected|built|drove|driving|designed|shipped|launched|delivered|ran|stood up|mandated|defined|established|eliminated|cut|raised|authored|created|codified|enforced|killed|turned|moved|gated|wrote|planted)\b/i;
const r2 = x => Math.round(x * 100) / 100;

export const PERSONAS = {
  recruiter: {
    label: 'Recruiter',
    line: 'The scan: role, years, scope, results, and how to reach him.',
    text: 'product manager fintech payments cards enterprise b2b clients launch go-to-market stakeholders platform agentic ai llm us emea india delivery',
  },
  'hiring-manager': {
    label: 'Hiring manager',
    line: 'How he thinks: strategy, architecture calls, tradeoffs and results.',
    text: 'platform strategy roadmap architecture tradeoffs cost economics apis integrations data platform launch gtm enterprise clients agentic ai evals execution cross-functional stakeholders',
  },
  engineer: {
    label: 'Engineer',
    line: 'Can he hold his own in the design review? The technical evidence.',
    text: 'apis webhooks idempotency architecture system design data pipelines kafka dbt airflow data contracts schema mcp rag evals vector technical prototype javascript integrations',
  },
  founder: {
    label: 'Founder',
    line: 'Range and speed: 0-to-1, shipping solo, taste and judgement.',
    text: '0 to 1 mvp startup from scratch launch prototype design ux go-to-market technical consumer b2b ai agents cost',
  },
};

const STOP = new Set(('a an and are as at be by for from has have he his i in into is it its of on or our that the their this to was we were what when where which who will with you your about over under than then them they these those via per vs not no can do does did done using use used also more most any all each such only own other some very just across within without between onto off up out new one two three'.split(' ')));

const norm = s => String(s || '').toLowerCase().replace(/[‐-―]/g, '-').replace(/→/g, ' to ');
const stem = w => (w.length > 4 ? w.replace(/(ings|ing|ies|es|ed|s)$/, '') : w);
const tokens = s => norm(s).split(/[^a-z0-9$%+]+/).filter(t => t && !STOP.has(t)).map(stem);
// numbers keep their units: "$3B" must meet money in billions, not the 3 in "Fortune 3"
const UNIT = { bn: 'b', billion: 'b', b: 'b', million: 'm', m: 'm', thousand: 'k', k: 'k', lakh: 'l', '%': '%', x: 'x',
  day: 'd', days: 'd', week: 'w', weeks: 'w', month: 'mo', months: 'mo', year: 'y', years: 'y', yr: 'y', yrs: 'y', hour: 'h', hours: 'h', minute: 'min', minutes: 'min' };
const numbers = s => {
  const out = [];
  const re = /(\$|₹)?\s?(\d+(?:\.\d+)?)\s*-?\s*(bn|billion|million|thousand|lakh|days?|weeks?|months?|years?|yrs?|hours?|minutes?|[%xkmb](?![a-z]))?/g;
  for (const m of norm(s).replace(/(\d),(\d)/g, '$1$2').matchAll(re)) {
    const bare = String(parseFloat(m[2]));
    const unit = m[3] ? UNIT[m[3]] || '' : '';
    out.push({ bare, key: (m[1] ? '$' : '') + bare + unit, strict: !!(m[1] || unit) });
  }
  return { list: out, bare: new Set(out.map(n => n.bare)), keyed: new Set(out.map(n => n.key)) };
};
const numHit = (n, nums) => (n.strict ? nums.keyed.has(n.key) : nums.bare.has(n.bare));
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// keywords are literal phrases (hyphen/space tolerant); a "re:" prefix marks a raw regex
const kwRegex = kw => kw.startsWith('re:')
  ? new RegExp(`(^|[^a-z0-9])(?:${kw.slice(3)})(?=$|[^a-z0-9])`, 'g')
  : new RegExp(`(^|[^a-z0-9])${escapeRe(norm(kw)).replace(/\\-|\s+/g, '[\\s-]?')}(?=$|[^a-z0-9])`, 'g');

/* ---------- index: every record and every evidence line ---------- */
const cache = new WeakMap();
export function index(data) {
  if (cache.has(data)) return cache.get(data);
  const base = data.base_url;
  const records = new Map();
  const add = (ref, r) => records.set(ref, { ref, ...r });
  // where it happened: a case belongs to the role that ran it, so one job is never counted twice
  const roleOf = id => data.roles.find(r => r.cases.includes(id))?.id;
  for (const c of data.cases) {
    add(`case:${c.id}`, { kind: 'case', id: c.id, title: c.title, org: c.org, period: c.period, end: endOf(c.period, data.updated), url: base + c.anchor, summary: c.summary, metric: c.metric, evidence: c.evidence, stack: c.stack, place: `role:${roleOf(c.id) || c.id}` });
  }
  for (const r of data.roles) {
    const linked = r.cases.map(id => data.cases.find(c => c.id === id)).filter(Boolean);
    add(`role:${r.id}`, {
      kind: 'role', id: r.id, title: `${r.title}, ${r.company}`, org: r.company, period: r.period, end: endOf(r.period, data.updated), url: base + '#sec-experience',
      summary: r.scope, evidence: [...r.evidence, ...linked.flatMap(c => c.evidence)], cases: r.cases, place: `role:${r.id}`,
    });
  }
  for (const p of data.projects) {
    add(`project:${p.id}`, { kind: 'project', id: p.id, title: p.name, org: 'Side project', url: p.url, portfolio: base + p.anchor, summary: p.tagline, evidence: p.evidence, stack: p.built_with, end: data.updated.slice(0, 7), place: `project:${p.id}` });
  }
  // the searchable corpus: one document per evidence line (role lines that duplicate a case are skipped)
  const docs = [];
  for (const r of records.values()) {
    const own = r.kind === 'role' ? data.roles.find(x => x.id === r.id).evidence : r.evidence;
    for (const line of [r.summary, ...own]) docs.push({ ref: r.ref, line, toks: tokens(line), nums: numbers(line) });
  }
  const df = new Map();
  for (const d of docs) for (const t of new Set(d.toks)) df.set(t, (df.get(t) || 0) + 1);
  const idf = t => Math.log(1 + docs.length / (df.get(t) || 0.5));
  const comps = data.competencies.map(c => ({ ...c, res: c.keywords.map(k => ({ k, re: kwRegex(k) })) }));
  const out = { records, docs, idf, comps };
  cache.set(data, out);
  return out;
}

const brief = r => ({ ref: r.ref, kind: r.kind, id: r.id, title: r.title, url: r.url });

// "May 2022 - May 2024" -> "2024-05"; "Aug 2026 - present" -> the record's updated month
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
function endOf(period, updated) {
  const end = String(period || '').split(/\s+[-–]\s+/).pop().trim().toLowerCase();
  if (!end || end === 'present' || end === 'now') return updated.slice(0, 7);
  const m = end.match(/(?:([a-z]{3})[a-z]*\s+)?(\d{4})/);
  if (!m) return updated.slice(0, 7);
  const mon = m[1] ? MONTHS.indexOf(m[1]) + 1 : 6;
  return `${m[2]}-${String(mon || 6).padStart(2, '0')}`;
}
const monthsBetween = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return Math.max(0, (yb - ya) * 12 + (mb - ma)); };

/* ---------- profile, list, get, contact ---------- */
export function getProfile(data) {
  const p = data.profile;
  return {
    name: p.name, headline: p.headline, current: p.current, location: p.location, open_to: p.open_to, travel: p.travel,
    experience: p.experience, summary: p.summary, education: p.education, headline_numbers: p.headline_numbers,
    principles: data.principles, links: p.links,
  };
}

export function listWork(data, kind = 'all') {
  const { records } = index(data);
  const want = { cases: 'case', roles: 'role', projects: 'project' }[kind];
  return [...records.values()].filter(r => !want || r.kind === want).map(r => ({
    ...brief(r), period: r.period, summary: r.summary, metric: r.metric ? `${r.metric.value} ${r.metric.label}` : undefined,
  }));
}

export function getWork(data, idOrName) {
  const { records } = index(data);
  const q = norm(idOrName).trim();
  if (!q) return null;
  let r = records.get(q) || [...records.values()].find(x => x.id === q);
  if (!r) {
    const qt = tokens(q);
    let best = 0;
    for (const x of records.values()) {
      const tt = new Set(tokens(`${x.title} ${x.org} ${x.id.replace(/-/g, ' ')}`));
      const s = qt.filter(t => tt.has(t)).length / Math.max(qt.length, 1);
      if (s > best) { best = s; r = x; }
    }
    if (best < 0.5) r = null;
  }
  if (!r) return null;
  const { kind, id, title, org, period, url, summary, metric, evidence, stack, portfolio, cases } = r;
  return { ref: r.ref, kind, id, title, org, period, url, portfolio, summary, metric, evidence, stack, cases };
}

export function contact(data) {
  const p = data.profile;
  return { name: p.name, email: p.contact.email, linkedin: p.contact.linkedin, portfolio: p.links.portfolio, resume: p.links.resume, preferred: p.contact.preferred, open_to: p.open_to, location: p.location };
}

/* ---------- search ---------- */
export function searchEvidence(data, query, limit = 8) {
  const { docs, idf, records } = index(data);
  const qt = [...new Set(tokens(query))];
  const qn = numbers(query).list;
  if (!qt.length && !qn.length) return [];
  const phrase = norm(query).trim();
  const scored = [];
  for (const d of docs) {
    const set = new Set(d.toks);
    let s = 0, hit = 0;
    for (const t of qt) if (set.has(t)) { s += idf(t); hit++; }
    for (const n of qn) if (numHit(n, d.nums)) { s += 2; hit++; }
    if (!hit) continue;
    if (phrase.length > 3 && norm(d.line).includes(phrase)) s += 4;
    s *= 0.6 + 0.4 * (hit / (qt.length + qn.length));
    scored.push({ s, d });
  }
  scored.sort((a, b) => b.s - a.s);
  const seen = new Set();
  const out = [];
  for (const { s, d } of scored) {
    const key = d.line;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...brief(records.get(d.ref)), quote: d.line, score: Math.round(s * 10) / 10 });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- prove a claim ----------
   Topic first, numbers second: a line only supports a claim if it is about the same thing
   (>= half the claim's words) AND carries every number the claim uses. Claims that land on a
   known gap (e.g. managing PMs) are refused outright. */
export function proveClaim(data, claim) {
  const { docs, records, comps } = index(data);
  const words = [...new Set(tokens(claim))].filter(t => !/\d/.test(t));
  const cn = numbers(claim).list;
  if (!words.length && !cn.length) return { claim, verdict: 'not_found', explanation: 'The claim has no words or numbers to check.', evidence: [] };
  const quote = r => ({ ...brief(records.get(r.d.ref)), quote: r.d.line });

  const gap = detect(claim, comps).find(f => f.c.strength === 'gap');
  if (gap) {
    return { claim, verdict: 'not_supported', explanation: `Not supported. ${gap.c.note}`, evidence: [] };
  }
  const rows = docs.map(d => {
    const set = new Set(d.toks);
    const ov = words.length ? words.filter(t => set.has(t)).length / words.length : 0;
    const nf = cn.filter(n => numHit(n, d.nums)).length;
    const hits = words.filter(t => set.has(t)).length;
    return { d, ov, hits, numsOk: nf === cn.length, nf };
  }).sort((a, b) => b.ov - a.ov || b.nf - a.nf);

  const onTopic = rows.filter(r => r.ov >= 0.5);
  const proof = onTopic.find(r => r.numsOk);
  let verdict, evidence;
  if (proof) { verdict = 'supported'; evidence = [proof, ...onTopic.filter(r => r !== proof && r.numsOk)].slice(0, 3).map(quote); }
  else if (onTopic.length && cn.length) { verdict = 'differs'; evidence = onTopic.slice(0, 3).map(quote); }
  else if (rows[0] && rows[0].ov >= 0.34 && rows[0].hits >= 2) { verdict = 'partial'; evidence = rows.filter(r => r.ov >= 0.34 && r.hits >= 2).slice(0, 3).map(quote); }
  else { verdict = 'not_found'; evidence = []; }
  const explanation = {
    supported: 'Supported: the record states this, quoted below.',
    partial: 'Partly supported: related evidence exists, but not this exact claim. Quote the evidence rather than the claim.',
    differs: 'Not as stated: the record covers this with different numbers. Use the quoted figures instead.',
    not_found: 'No evidence for this claim in the record. Do not repeat it as fact; ask Parth.',
  }[verdict];
  return { claim, verdict, explanation, evidence };
}

/* ---------- fit for a job description ---------- */
function detect(text, comps) {
  const t = ' ' + norm(text) + ' ';
  const found = [];
  for (const c of comps) {
    const kws = [];
    for (const { k, re } of c.res) { re.lastIndex = 0; if (re.test(t)) kws.push(k); }
    if (kws.length) found.push({ c, kws, w: 1 + Math.min(kws.length - 1, 2) * 0.5 });
  }
  return found;
}

function bestQuote(rec, kws, avoid = new Set()) {
  // the line that names the most of what was asked for, preferring one with a number in it
  // and one not already quoted for another requirement
  const res = kws.map(kwRegex);
  let best = null, top = 0;
  for (const line of rec.evidence) {
    const t = ' ' + norm(line) + ' ';
    const hits = res.filter(re => { re.lastIndex = 0; return re.test(t); }).length;
    const s = hits && hits + (/\d/.test(line) ? 0.5 : 0) - (avoid.has(line) ? 10 : 0);
    if (hits && (best === null || s > top)) { top = s; best = line; }
  }
  return best || rec.evidence[0] || rec.summary;
}

function guessTitle(text) {
  const first = String(text).trim().split(/\n|\.\s/)[0].trim();
  if (first && first.length <= 90 && /manager|lead|head|director|product|owner|\bpm\b/i.test(first)) return first.replace(/^(job title|role|position)\s*[:-]\s*/i, '');
  const m = String(text).match(/(?:(?:senior|staff|principal|lead|group|technical|founding|ai|platform)\s+){0,3}(?:product\s+(?:manager|lead|owner)|director of product|head of product|vp,? product)[^\n.;()]{0,40}/i);
  return m ? m[0].trim() : null;
}

export function fitFor(data, jobText, { persona } = {}) {
  const { comps } = index(data);
  const text = persona && PERSONAS[persona] ? PERSONAS[persona].text : String(jobText || '');
  const title = persona ? PERSONAS[persona]?.label : guessTitle(text);
  return build(data, detect(text, comps), { title, text, persona });
}

// Rebuild a fit from requirement ids and weights (used by share links, so no JD text sits in a URL).
// items: [{ id: 'card-issuing', w: 1.5 }, ...]
export function fitFromIds(data, items, title = null) {
  const { comps } = index(data);
  const found = items.map(({ id, w }) => {
    const c = comps.find(x => x.id === id);
    return c && { c, kws: c.keywords.filter(k => !k.startsWith('re:')).slice(0, 2), w: Math.min(Math.max(+w || 1, 1), 2) };
  }).filter(Boolean);
  return build(data, found, { title, text: '', persona: 'link' });
}

/* ---------- confidence: how strongly does his record evidence this requirement? ----------
   Each line of evidence is weighed on five things you can see in the line itself:
     relevance    it uses your words (1.0) or is linked to the skill by his record only (0.7)
     ownership    he owned or led it: the line opens with owned, led, built, shipped... (1.0) or not (0.85)
     specificity  it carries a number (1.0) or doesn't (0.85)
     recency      within a year (1.0), within three (0.9), older (0.75)
     setting      day job (1.0) or side project (0.85)
   Lines from the same place (a role and its case studies, or one project) count once: the strongest.
   Places combine like independent examples:  confidence = 1 - Π(1 - 0.75 × place)
   so one strong place reaches 0.75 and "Strong" (0.85+) needs evidence from two places or more.
   His own self-assessment can cap it (gap 0.15, adjacent 0.45, working 0.70), never raise it. */
function hitsIn(line, kws) {
  const t = ' ' + norm(line) + ' ';
  return kws.filter(k => { const re = kwRegex(k); return re.test(t); });
}
function assess(data, f, records, quoted) {
  const now = data.updated.slice(0, 7);
  const items = f.c.evidence.map(ref => records.get(ref)).filter(Boolean).map((r, i) => {
    const quote = bestQuote(r, f.kws, quoted);
    if (i === 0) quoted.add(quote);
    const words = hitsIn(quote, f.kws).filter(k => !k.startsWith('re:'));
    const months = monthsBetween(r.end || now, now);
    const factors = {
      relevance: words.length ? 1 : 0.7,
      ownership: OWNED.test(quote.trim()) ? 1 : 0.85,
      specificity: /\d/.test(quote) ? 1 : 0.85,
      recency: months <= 12 ? 1 : months <= 36 ? 0.9 : 0.75,
      setting: r.kind === 'project' ? 0.85 : 1,
    };
    const e = r2(Object.values(factors).reduce((x, y) => x * y, 1));
    return { ...brief(r), org: r.org, period: r.period, place: r.place, quote, matched: words, months, factors, e };
  });
  const places = new Map();
  for (const it of items) if (!places.has(it.place) || places.get(it.place).e < it.e) places.set(it.place, it);
  const parts = [...places.values()].sort((x, y) => y.e - x.e).map(it => ({ place: it.place, title: it.title, value: it.e }));
  const raw = parts.length ? 1 - parts.reduce((acc, x) => acc * (1 - K * x.value), 1) : 0;
  const cap = CAP[f.c.strength];
  const confidence = r2(Math.min(raw, cap ?? 1, CEILING));
  return { items, parts, raw: r2(raw), cap: cap != null && raw > cap ? cap : null, confidence };
}

const placeName = it => (it.kind === 'project' ? `${it.title} (side project)` : `${it.org}${it.period ? `, ${it.period.replace(/\s*-\s*present/i, ' to now').replace(/\s+-\s+/, ' to ')}` : ''}`);
function reasonsFor(a, f) {
  const out = [];
  if (!a.items.length) return ['Nothing in his record evidences this.', ...(f.c.note ? [`On record: ${f.c.note}`] : [])];
  const tops = [...new Map(a.items.map(it => [it.place, it])).values()];
  out.push(`Evidenced in ${tops.length} place${tops.length > 1 ? 's' : ''}: ${[...new Set(tops.map(placeName))].join('; ')}.`);
  const words = [...new Set(a.items.flatMap(x => x.matched))];
  out.push(words.length ? `Your words appear in his record: ${words.slice(0, 5).map(w => `"${w}"`).join(', ')}.` : 'Linked to this skill by his record rather than your exact wording.');
  const owned = a.items.filter(x => x.factors.ownership === 1).length;
  if (owned) out.push(`He owned or led it in ${owned} of ${a.items.length} quoted lines.`);
  const nums = a.items.filter(x => x.factors.specificity === 1).length;
  if (nums) out.push(`${nums} of ${a.items.length} lines carry a measured result.`);
  const newest = a.items.reduce((x, y) => (y.months < x.months ? y : x));
  out.push(`Most recent evidence: ${placeName(newest)}${newest.months <= 1 ? ' (current)' : `, ${newest.months} months ago`}.`);
  if (a.parts.length === 1 && a.cap == null) out.push('One place only, so it stops short of "Strong", which needs a second role or project.');
  if (a.cap != null) out.push(`Capped at ${a.cap} by his own assessment ("${STRENGTH_LABEL[f.c.strength]}"): self-assessment can lower a score, never raise it.${f.c.note ? ` ${f.c.note}` : ''}`);
  return out;
}
const mathOf = a => {
  if (!a.parts.length) return 'no evidence = 0';
  const raw = a.raw >= 0.995 ? '0.99+' : a.raw.toFixed(2);
  const tail = a.cap != null ? `, capped at ${a.cap} by his own assessment` : a.raw > CEILING ? `, held at ${CEILING} (nothing is certain)` : '';
  return `1 - ${a.parts.map(x => `(1 - 0.75 × ${x.value.toFixed(2)})`).join(' × ')} = ${raw}${tail}`;
};

function build(data, found, { title, text, persona }) {
  const { records, comps } = index(data);
  if (!found.length) {
    return { title, score: null, band: 'Not enough to go on', credit: null, matches: [], gaps: [], also: [], read_first: [], notes: [], questions: [], summary: [],
      message: 'No recognisable requirements found. Paste the full job description (responsibilities and requirements).' };
  }
  const quoted = new Set();
  const rows = found.map(f => ({ f, a: assess(data, f, records, quoted) }))
    .sort((x, y) => y.f.w * y.a.confidence - x.f.w * x.a.confidence);
  const den = found.reduce((s, f) => s + f.w, 0);
  // a must-have asked for more than once with (almost) no evidence caps the whole fit: an average shouldn't hide it
  const hard = rows.filter(x => x.f.w >= 1.5 && x.a.confidence <= 0.15).map(x => x.f.c.label);
  const HARD_CAP = 44;
  let score = Math.round(100 * rows.reduce((s, x) => s + x.f.w * x.a.confidence, 0) / den);
  if (hard.length) score = Math.min(score, HARD_CAP);
  const band = FIT_BANDS.find(([min]) => score >= min)[1];

  const toRow = ({ f, a }) => ({
    id: f.c.id, label: f.c.label, weight: f.w, matched: f.kws,
    confidence: a.confidence, confidence_band: bandOf(a.confidence),
    strength: f.c.strength, strength_label: STRENGTH_LABEL[f.c.strength],
    reasons: reasonsFor(a, f), math: mathOf(a), note: f.c.note,
    evidence: a.items.map(({ place, ...it }) => it),
  });
  const isGap = x => x.a.confidence < 0.4 || ['gap', 'adjacent'].includes(x.f.c.strength);
  const matches = rows.filter(x => !isGap(x)).map(toRow);
  const gaps = rows.filter(isGap).map(toRow);
  const coverage = { evidenced: rows.filter(x => x.a.confidence >= 0.65).length, total: rows.length };

  const foundIds = new Set(found.map(f => f.c.id));
  const also = comps.filter(c => c.strength === 'core' && !foundIds.has(c.id)).slice(0, 3)
    .map(c => ({ id: c.id, label: c.label, evidence: c.evidence.map(ref => records.get(ref)).filter(Boolean).slice(0, 1).map(r => ({ ...brief(r), quote: r.evidence[0] })) }));

  // which cases/projects to read first: the ones carrying most of this score
  const weight = new Map();
  for (const { f, a } of rows) for (const it of a.items) {
    if (it.kind === 'role') continue;
    weight.set(it.ref, (weight.get(it.ref) || 0) + f.w * it.e);
  }
  const read_first = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([ref]) => {
    const r = records.get(ref);
    return { ...brief(r), summary: r.summary, metric: r.metric ? `${r.metric.value} ${r.metric.label}` : undefined };
  });

  const notes = [];
  if (hard.length) notes.push(`Hard gap: ${hard.join(', ')} is asked for repeatedly and nothing in his record evidences it, so the fit is capped at ${HARD_CAP}.`);
  const yrs = String(text).match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)/i);
  if (yrs && !persona) {
    const need = parseInt(yrs[1], 10);
    const have = Math.floor((new Date(data.updated) - new Date('2021-02-01')) / (365.25 * 864e5) * 10) / 10;
    notes.push(need <= have
      ? `Experience: the role asks for ${need}+ years; Parth has ~${have} years in B2B SaaS (4+ in fintech).`
      : `Experience: the role asks for ${need}+ years; Parth has ~${have} years in B2B SaaS (4+ in fintech) - weigh scope and results against tenure.`);
  }
  if (/\b(director|head of|vp|vice president|group product manager)\b/i.test(text) && !persona) notes.push('Level: this reads as a people-leadership role; see the "Managing PMs" gap.');
  if (/\b(remote)\b/i.test(text)) notes.push('Location: based in Hyderabad, India; open to relocation.');

  const questions = [];
  for (const g of gaps.slice(0, 2)) questions.push(`${g.label}: ask how he'd close this gap in his first 90 days.${g.note ? ` On record: ${g.note}` : ''}`);
  for (const m of matches.slice(0, 3)) {
    const e = m.evidence[0];
    if (e) questions.push(`${m.label}: ask him to walk through "${e.title}" - ${e.quote.replace(/\.$/, '')}.`);
  }

  const summary = matches.slice(0, 3).map(m => `${m.label}: ${m.evidence[0]?.quote || m.note || ''}`);
  const detected = found.map(f => ({ id: f.c.id, w: f.w }));
  return {
    title, score, band, credit: Math.round(300 + (score / 100) * 550), coverage,
    method: 'Each requirement: every line of evidence is weighed on relevance (your words 1.0, linked 0.7) × ownership (owned or led 1.0, else 0.85) × specificity (a number 1.0, else 0.85) × recency (1 year 1.0, 3 years 0.9, older 0.75) × setting (day job 1.0, side project 0.85). Lines from the same role or project count once. Places combine as confidence = 1 - Π(1 - 0.75 × place), so one strong place reaches 0.75 and 0.85+ needs two. His self-assessment can only cap it. Fit = the average of confidence across your requirements, weighted by how often you ask for each, × 100; a must-have with no evidence caps it at 44. Everything is from his own record: much of it is internal to employers, so nothing is checked against the web.',
    matches, gaps, also, read_first, notes, questions, summary, detected,
  };
}

/* ---------- a plain-text resume (served as an MCP resource) ---------- */
export function resumeMarkdown(data) {
  const p = data.profile;
  const lines = [`# ${p.name}`, `${p.headline} · ${p.location}`, '', p.summary, '', `Now: ${p.current.title}, ${p.current.company} (${p.current.since}). ${p.current.focus}`, '', '## Case studies'];
  for (const c of data.cases) lines.push('', `### ${c.title} (${c.org}, ${c.period})`, `${c.metric.value} ${c.metric.label}`, ...c.evidence.map(e => `- ${e}`));
  lines.push('', '## Roles');
  for (const r of data.roles) lines.push(`- ${r.title}, ${r.company}, ${r.period}. ${r.scope}`);
  lines.push('', '## Side projects');
  for (const pr of data.projects) lines.push(`- ${pr.name} (${pr.url}): ${pr.tagline}`);
  lines.push('', '## Recognition', ...data.awards.map(a => `- ${a.name}, ${a.org}, ${a.date}: ${a.for}`));
  lines.push('', `Contact: ${p.contact.email} · ${p.contact.linkedin} · ${p.links.portfolio}`);
  return lines.join('\n');
}
