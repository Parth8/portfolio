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
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// keywords are literal phrases (hyphen/space tolerant); a "re:" prefix marks a raw regex
const kwRegex = kw => kw.startsWith('re:')
  ? new RegExp(`(^|[^a-z0-9])(?:${kw.slice(3)})(?=$|[^a-z0-9])`, 'g')
  : new RegExp(`(^|[^a-z0-9])${escapeRe(norm(kw)).replace(/\\-|\s+/g, '[\\s-]?')}(?=$|[^a-z0-9])`, 'g');

/* ================= text analysis shared by search, claims and fit =================
   Words are reduced to stems; numbers keep their units and scale; dates keep month and year. */
const IRREGULAR = { led: 'lead', ran: 'run', built: 'build', won: 'win', wrote: 'write', written: 'write', held: 'hold', went: 'go', made: 'make', began: 'begin', got: 'get', did: 'do', took: 'take', gave: 'give', paid: 'pay', sold: 'sell', taught: 'teach', grew: 'grow', drove: 'drive', driven: 'drive', fell: 'fall', fallen: 'fall', spoke: 'speak', spoken: 'speak', saw: 'see', knew: 'know', known: 'know', left: 'leave', met: 'meet', lost: 'lose', chose: 'choose', cut: 'cut', shipped: 'ship', issuance: 'issue', issuances: 'issue', delivery: 'deliver', deliveries: 'deliver', won: 'win', people: 'person', annually: 'year', annual: 'year', yearly: 'year', wound: 'wind', rose: 'rise', risen: 'rise', shrank: 'shrink', shrunk: 'shrink', kept: 'keep', brought: 'bring', saw: 'see', seen: 'see', thought: 'think', found: 'find' };
function st(word) {
  let w = String(word).toLowerCase().replace(/['’]s?$/, '').replace(/\./g, '');
  if (IRREGULAR[w]) w = IRREGULAR[w];
  if (w.length <= 2 || /\d/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(ss|us|is|as|os)$/.test(w)) { /* keep */ }
  else if (/es$/.test(w) && /(ch|sh|x|z|ss|s)es$/.test(w)) w = w.slice(0, -2);
  else if (/s$/.test(w)) w = w.slice(0, -1);
  const d = w.match(/^(.{4,}?)(ations?|ments?|ances?|ences?|ings?|ied|ed|ly)$/) || w.match(/^(.{3,}?)(ing|ed|ly)$/);
  if (d) w = d[1];
  const a = w.match(/^(.{3,}?)(er|or)$/);
  if (a) w = a[1];
  if (w.length > 2 && /e$/.test(w)) w = w.slice(0, -1);
  if (w.length > 3 && /([a-km-rt-z])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}
const stems = s => new Set(s.split(' ').filter(Boolean).map(st));

// words that never decide a claim or a search
const FRAME = new Set([...STOP, ...('parth aggarwal she her they people person thing things worked work works working currently now recently previously formerly ever still already really actually quite around roughly approximately nearly almost less least total overall made make makes get got take took hold holds held receive received receives win won wins earn earned earns complete completed completes title titled role position job course certificate certification degree award awards company employer many much several few lot way while during after before until through hello please tell me give show find know let want need get got if so but nor yes how many much long often had been being am experience cover covers include includes contain contains feature offer provide dated date wrote write written publish published app apps application site website'.split(' '))].map(st));
// ordinary words that may be absent from the record without meaning the claim is about something new
const COMMON = stems('year month week day hour time ago later earlier first second third last next previous current present future past recent often sometimes usually thing something someone kind type sort part series list number amount level high low large small big old good great best better strong key main major minor lead team group client customer user company business market industry field area domain career experience skill knowledge expert expertise familiar proficient background tool technology tech software product project program service system process worker manager management design code data fall drop increase decrease decline grow rise improve boost save spend spent cost pay sell buy hire join leave start begin end finish stop change add remove create develop implement deploy test release plan define set establish focus handle support help enable allow provide offer include contain cover track monitor measure report analyse analyze review talk able ability successful successfully proven live status question answer result outcome figure metric score rate speed size scale impact value goal target stage phase step case example detail reason cause effect issue problem solution approach method model version feature deliver ship own run drive manage build cut reduce lower raise miss publish write app application site page website web online digital global local national international public private open free paid full whole half double triple cent percent plus minus above below among inside outside near far same different similar either neither both');
const ABSOLUTE = new Set('never always every everything everyone everybody entire entirely whole each none nobody nothing fully completely only solely exclusively all'.split(' '));
const NEGATORS = new Set('refuse refused refuses refusing reject rejected forbid forbade forbidden no not never without none nothing nobody neither nor cannot cant dont doesnt didnt wasnt isnt arent hasnt havent'.split(' '));
const MONTHS3 = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
const NUMWORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
// groups of near-synonyms: stems in one group count as the same word
const SYN_GROUPS = [
  // down / removal
  'cut reduce reduction lower fall drop decrease decline slash shrink down save saving remove removal eliminate elimination delete retire shorten trim',
  // up
  'rise increase raise grow growth boost lift improve gain climb jump up',
  // making things
  'build create develop make ship launch deliver release golive produce',
  'win receive earn award', 'own lead run drive', 'cost spend', 'use utilise', 'issue issuance',
  'join start begin', 'study education school', 'qualification degree', 'article post essay', 'tool app application',
  'generate synthesise synthesize produce', 'expire expiry expiration', 'span cover', 'automatic automate automat',
  'double twice 2x', 'compare benchmark evaluate', 'refuse reject decline', 'require mandate demand', 'write author document',
  'execute execution', 'accurate accuracy', 'refuse refusal', 'tell inform say', 'serve deliver', 'unintuitive confusing',
].map(g => g.split(' ').map(st));
const DOWN = new Set('cut reduce reduction lower fall drop decrease decline slash shrink down save saving remove removal eliminate elimination delete retire shorten trim'.split(' ').map(st));
const UP = new Set('rise increase raise grow growth boost lift improve gain climb jump up'.split(' ').map(st));
// ordinary words that cannot decide a claim about a career record
// verbs and modifiers that may be missing from the line a claim paraphrases without changing what it says
const LIGHT = stems('live build make create develop implement deploy release plan define set establish handle support help enable allow provide offer include contain track monitor measure report able successful successfully proven ship deliver own run drive publish write launch start begin end finish stop add change high low large small big strong key main major recent often usually new first full whole half');
const GLUE = stems('keep bring see span meet thank wait get go there here right well way find like even also still already just really very quite kind sort lot bit part because enough while although though however whether should would could might try give him them ask come hit one');
const SYN = new Map();
for (const g of SYN_GROUPS) for (const s of g) SYN.set(s, [...new Set([...(SYN.get(s) || []), ...g])]);
const alts = s => SYN.get(s) || [s];

// words of a text with their position: [{ low, stem, cap, i }]
function wordsOf(text) {
  const out = [];
  const re = /(?<![A-Za-z0-9$.])[A-Za-z][A-Za-z0-9]*(?:[.'’\-][A-Za-z0-9]+)*/g;
  let i = 0;
  for (const m of String(text).matchAll(re)) {
    const raw = m[0];
    const parts = raw.includes('-') ? raw.split('-') : [raw];
    for (const p of parts) {
      if (!p || /^\d+$/.test(p)) continue;
      out.push({ raw: p, low: p.toLowerCase().replace(/['’]s?$/, '').replace(/\./g, ''), stem: st(p), cap: /^[A-Z]/.test(p), caps: /^[A-Z0-9]{2,}$/.test(p) || /[a-z][A-Z]/.test(p), i: i++, pos: m.index, part: parts.length > 1 });
    }
    if (parts.length > 1) { const j = raw.replace(/-/g, ''); out.push({ raw: j, low: j.toLowerCase(), stem: st(j), cap: /^[A-Z]/.test(raw), caps: false, i: i++, pos: m.index, joined: true }); }
  }
  return out;
}

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
// dates: "Dec 2023", "15 September 2025", "2026-01-21", "2017-2021", "2024". Month is null when only a year is given.
function datesOf(text, updated = '2026-11-10') {
  const out = [];
  let t = ' ' + String(text).replace(/[‐-―]/g, '-') + ' ';
  const take = (re, f) => { t = t.replace(re, (...a) => { const d = f(...a); if (d) out.push(d); return ' '.repeat(a[0].length); }); };
  take(new RegExp(`(?:\\b\\d{1,2}(?:st|nd|rd|th)?\\s+)?\\b${MONTH_RE}\\.?,?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?((?:19|20)\\d{2})\\b`, 'gi'), (all, mo, y) => ({ y: +y, m: MONTHS3.indexOf(mo.slice(0, 3).toLowerCase()) + 1 }));
  take(/\b((?:19|20)\d{2})-(\d{2})(?:-\d{2})?\b/g, (all, y, m) => (+m >= 1 && +m <= 12 ? { y: +y, m: +m } : null));
  take(/\b((?:19|20)\d{2})\b/g, (all, y) => ({ y: +y, m: null }));
  if (/\b(present|now|to date|ongoing)\b/i.test(t.replace(/\bnow\b/gi, m => m)) && /\b(?:-|to|until|till)\s+(present|now|date)\b/i.test(t)) out.push({ y: +updated.slice(0, 4), m: +updated.slice(5, 7), present: true });
  return out;
}
const dateMatch = (c, ds) => ds.some(d => d.y === c.y && (c.m == null || d.m === c.m));

const SCALE = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 };
const TIME = { day: 'day', days: 'day', week: 'week', weeks: 'week', month: 'month', months: 'month', mo: 'month', year: 'year', years: 'year', yr: 'year', yrs: 'year', hour: 'hour', hours: 'hour', hr: 'hour', hrs: 'hour', minute: 'minute', minutes: 'minute', min: 'minute', mins: 'minute', second: 'second', seconds: 'second', sec: 'second', secs: 'second' };
// number phrases written in words: "a week" -> "1 week" (not after an amount: "$50K a year"), "twice" -> "2x", "by half" -> "50%"
const TIMEU = '(?:day|week|month|year|hour|minute|second)s?';
function normNum(text) {
  let t = String(text);
  t = t.replace(new RegExp(`(^|[^\\w$~.,/%])(an?|one)(\\s+|-)(?=${TIMEU}\\b)`, 'gi'), (m, pre, w, sep, off, all) => {
    const before = all.slice(0, off + pre.length).trimEnd().split(/\s+/).pop() || '';
    if (/^[~$₹]?\d[\d,.]*[kmb%+]*$/i.test(before) || /^(per|each|every)$/i.test(before) || /\//.test(before)) return m;
    if (/^an?$/i.test(w) && !/\b(from|in|within|for|took|take|waiting|wait|over|under|after|before|than|about|around|every)\s*(?:\w+\s+)?$/i.test(all.slice(0, off + pre.length))) return m;
    return `${pre}1${sep === '-' ? '-' : ' '}`;
  });
  t = t.replace(new RegExp(`\\bone(?=[\\s-]+${TIMEU}\\b)`, 'gi'), '1').replace(/\b(from [\w$.,~]+(?: [a-z]+)? to) one\b/gi, '$1 1');
  t = t.replace(/\b(?:by |in )(?:about |roughly |nearly |around )?half\b/gi, ' 50%').replace(/\b(?:double|doubled|twice|two times)\b(?: as (?:much|many))?/gi, '2x');
  return t;
}
// wordy equivalents, applied to a claim before it is analysed
const PHRASES = [[/go[- ]to[- ]market/gi, 'GTM'], [/machine[- ]learning/gi, 'ML'], [/artificial intelligence/gi, 'AI'], [/pre-?production/gi, 'pre-prod'], [/from (?:nothing|zero)\b/gi, 'from scratch'], [/fraud[- ]risk[- ]management/gi, 'FRM'], [/key performance indicators?/gi, 'KPI'], [/service[- ]level (?:agreement|objective)s?/gi, 'SLA'], [/one[- ]year/gi, '1-year'], [/per cent\b/gi, '%'], [/\bpercent\b/gi, '%'], [/\bdocs\b/gi, 'documentation'], [/\bmore than\b/gi, 'over']];
const normClaim = text => PHRASES.reduce((t, [re, r]) => t.replace(re, r), normNum(text));

// numbers with their units: { value, cls ('' | '$' | '%' | 'x' | time unit | size unit), noun, raw }
function numbersOf(text) {
  let t = normNum(text).replace(/[‐-―]/g, '-');
  t = t.replace(new RegExp(`(?:\\b\\d{1,2}(?:st|nd|rd|th)?\\s+)?\\b${MONTH_RE}\\.?,?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?(?:19|20)\\d{2}\\b`, 'gi'), m => ' '.repeat(m.length))
    .replace(/\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/g, m => ' '.repeat(m.length))
    .replace(/(?<![\d,])\b(?:19|20)\d{2}\b(?![,\d])/g, m => ' '.repeat(m.length));
  t = t.replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d),(\d{3})/g, '$1$2');
  t = t.replace(new RegExp(`\\b(${Object.keys(NUMWORDS).join('|')})\\b`, 'gi'), m => String(NUMWORDS[m.toLowerCase()]));
  t = t.replace(/\bzero\b(?!\s+to\b)/g, '0');
  const out = [];
  const re = /(?<![A-Za-z0-9.])(~?)(\$|₹|rs\.?\s?)?(\d+(?:\.\d+)?)\s?(bn|billion|million|thousand|lakhs?|crores?|days?|weeks?|months?|years?|yrs?|hours?|hrs?|minutes?|mins?|seconds?|secs?|ms|kib|kb|mb|gb|dpi|times|[%xkmb])?(?![A-Za-z])(\+?)(?:[\s-]+([A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){0,3}))?/gi;
  for (const m of t.matchAll(re)) {
    const unit = (m[4] || '').toLowerCase();
    let value = parseFloat(m[3]);
    let cls = m[2] ? '$' : '';
    if (SCALE[unit]) value *= SCALE[unit];
    else if (unit === '%') cls = '%';
    else if (unit === 'x' || unit === 'times') cls = cls || 'x';
    else if (TIME[unit]) cls = TIME[unit];
    else if (unit) cls = unit;
    const run = [];
    for (const w of (m[6] || '').split(/\s+/).filter(Boolean)) { if (STOP.has(w.toLowerCase())) break; run.push(...w.split('-').filter(Boolean).map(st)); }
    const taken = []; for (const w of (m[6] || '').split(/\s+/).filter(Boolean)) { if (STOP.has(w.toLowerCase())) break; taken.push(w); }
    out.push({ value, cls, nouns: run, noun: run[run.length - 1] || '', raw: (m[0].slice(0, m[0].length - (m[6] || '').length).replace(/[\s-]+$/, '') + (taken.length ? ' ' + taken.join(' ') : '')).trim(), plus: !!m[5] });
  }
  return out;
}
const famOf = cls => (TIME[cls] || ['hour', 'minute', 'second', 'day', 'week', 'month', 'year'].includes(cls) ? 'time' : cls || 'count');
const numEq = (a, b) => Math.abs(a.value - b.value) <= 1e-9 * Math.max(1, Math.abs(a.value)) && (!a.nouns.length || !b.nouns.length || a.nouns.some(x => b.nouns.includes(x))) && (!a.cls || !b.cls || a.cls === b.cls || (a.cls === '$' && !b.cls));
// the doc number a claim number should be compared with: same unit family, same noun, or the same order of magnitude
const comparable = (a, b) => (a.cls && b.cls ? famOf(a.cls) === famOf(b.cls) : a.nouns.some(x => b.nouns.includes(x)) || (a.cls && b.nouns.includes(a.cls)) || (b.cls && a.nouns.includes(b.cls))) || (!a.cls && !b.cls && ((a.nouns.some(x => b.nouns.includes(x))) || (!a.nouns.length && !b.nouns.length && Math.max(a.value / b.value, b.value / a.value) <= 20) || ((!a.nouns.length || !b.nouns.length) && a.value >= 1000 && b.value >= 1000 && Math.max(a.value / b.value, b.value / a.value) <= 20)));

/* ================= index: every record, evidence line and typed fact ================= */
const cache = new WeakMap();
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ym = s => { const [y, m] = s.split('-').map(Number); return y * 12 + m; };
const BANKISH = /^(bank|financial)$/i;

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
function startOf(period) {
  const s = String(period || '').split(/\s+[-–]\s+/)[0].trim().toLowerCase();
  const m = s.match(/(?:([a-z]{3})[a-z]*\s+)?(\d{4})/);
  if (!m) return null;
  return `${m[2]}-${String(m[1] ? MONTHS.indexOf(m[1]) + 1 || 1 : 1).padStart(2, '0')}`;
}
// whole months from "YYYY-MM" a to "YYYY-MM" b (never negative), and its plain-words form
export const monthsBetween = (a, b) => { const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number); return Math.max(0, (yb - ya) * 12 + (mb - ma)); };

// the record's typed facts, derived once: employers with dates, education, location, visa, years, awards, ...
export const fmtTenure = m => { const y = Math.floor(m / 12), r = m % 12; return [y ? `${y} year${y > 1 ? 's' : ''}` : '', r ? `${r} month${r > 1 ? 's' : ''}` : ''].filter(Boolean).join(' ') || '0 months'; };
export const fmtYM = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`; };
export function facts(data) {
  if (facts.cache.has(data)) return facts.cache.get(data);
  const p = data.profile, upd = data.updated.slice(0, 7);
  const employers = data.roles.map(r => {
    const start = startOf(r.period), present = /present|now/i.test(r.period);
    return { ref: `role:${r.id}`, id: r.id, company: r.company, title: r.title, period: r.period, start, end: present ? null : endOf(r.period, data.updated), current: present, location: r.location, products: (r.products || []).map(x => `${x.as}: ${x.name}`) };
  });
  const first = employers.reduce((a, e) => (e.start && (!a || e.start < a) ? e.start : a), null);
  // tenure is counted in whole months from the first role's start month to the record's `updated` month
  const months = first ? monthsBetween(first, upd) : null;
  // fintech tenure: from the first role whose own lines are about cards, banks or payments (Zeta, May 2022)
  const FIN = /\b(banks?|banking|cards?|fintech|payments?|issuing|issuer)\b/i;
  const finRole = data.roles.filter(r => FIN.test([r.scope, ...r.evidence, ...(r.cases || []).flatMap(id => { const c = data.cases.find(x => x.id === id); return c ? [c.title, c.summary, ...c.evidence] : []; })].join(' ')))
    .map(r => startOf(r.period)).filter(Boolean).sort()[0] || null;
  const finMonths = finRole ? monthsBetween(finRole, upd) : null;
  const ed = p.education_detail || {};
  const loc = p.location_detail || {};
  const vd = p.visa_detail || {};
  const out = {
    name: p.name, headline: p.headline,
    current: { title: p.current.title, company: p.current.company, since: p.current.since, ref: `role:${data.roles.find(r => r.company === p.current.company)?.id || ''}` },
    employers,
    location: { text: p.location, city: loc.city || p.location.split(',')[0].trim(), country: loc.country || (p.location.split(',')[1] || '').trim(), open_to_relocation: /relocat/i.test(p.open_to), open_to: p.open_to, ref: 'profile:location' },
    visa: { text: p.travel, country: vd.country || 'US', type: vd.type || (p.travel.match(/B1\/B2/) ? 'B1/B2' : null), valid_to: vd.valid_to || null, purpose: vd.purpose || (/business travel/i.test(p.travel) ? 'business travel' : null), work_authorisation: false, ref: 'profile:visa' },
    education: { text: p.education, degree: ed.degree || null, field: ed.field || null, specialisation: ed.specialisation || null, school: ed.school || null, city: ed.city || null, start: ed.start || null, end: ed.end || null, ref: 'profile:education' },
    experience: { text: p.experience, months, years: months == null ? null : r2(months / 12), since: first, fintech_since: finRole, fintech_months: finMonths, fintech_years: finMonths == null ? null : r2(finMonths / 12), b2b_saas_years_min: 5, fintech_years_min: 4, as_of: data.updated, ref: 'profile:experience' },
    awards: data.awards.map((a, i) => ({ ref: `award:${i}`, ...a })),
    certifications: data.certifications.map((c, i) => ({ ref: `cert:${i}`, ...c })),
    writing: data.writing.map((w, i) => ({ ref: `writing:${i}`, ...w })),
    skills: Object.entries(data.skills || {}).map(([group, areas]) => ({ group, areas: Object.entries(areas).map(([area, text]) => ({ area, text, ref: `skill:${group}/${area}` })) })),
    projects: data.projects.map(x => ({ ref: `project:${x.id}`, name: x.name, tagline: x.tagline })),
    contact: { email: p.contact.email, linkedin: p.contact.linkedin, preferred: p.contact.preferred, ref: 'profile:contact' },
  };
  facts.cache.set(data, out);
  return out;
}
facts.cache = new WeakMap();

export function index(data) {
  if (cache.has(data)) return cache.get(data);
  const base = data.base_url;
  const records = new Map();
  const add = (ref, r) => records.set(ref, { ref, ...r });
  // where it happened: one product or program. A role that ran two products counts as two places; a role's own
  // lines belong to its product when it has one, so the same work is never counted twice.
  const roleOf = id => data.roles.find(r => r.cases.includes(id));
  const caseLabel = c => { const r = roleOf(c.id); return `${r?.company || c.org} · ${c.product || c.title}, ${c.period || r?.period || ''}`.replace(/, $/, ''); };
  for (const c of data.cases) {
    add(`case:${c.id}`, { kind: 'case', id: c.id, title: c.title, org: c.org, period: c.period, end: endOf(c.period, data.updated), url: base + c.anchor, summary: c.summary, metric: c.metric, evidence: c.evidence, stack: c.stack, place: `case:${c.id}`, where: caseLabel(c), ctx: `${c.title} ${c.org} ${c.product || ''} ${roleOf(c.id)?.company || ''}` });
  }
  for (const r of data.roles) {
    const linked = r.cases.map(id => data.cases.find(c => c.id === id)).filter(Boolean);
    // a role's own lines: the one product without a case study, else its only case, else the role itself
    const caseless = (r.products || []).filter(x => !x.case);
    const own = caseless.length === 1 ? { place: `role:${r.id}`, where: `${r.company} · ${caseless[0].name}, ${r.period}` }
      : linked.length === 1 ? { place: `case:${linked[0].id}`, where: caseLabel(linked[0]) }
      : { place: `role:${r.id}`, where: `${r.company} · ${r.title}, ${r.period}` };
    const lineAt = new Map(r.evidence.map(l => [l, own]));
    for (const c of linked) for (const l of c.evidence) lineAt.set(l, { place: `case:${c.id}`, where: caseLabel(c) });
    add(`role:${r.id}`, {
      kind: 'role', id: r.id, title: `${r.title}, ${r.company}`, org: r.company, period: r.period, end: endOf(r.period, data.updated), url: base + '#sec-experience',
      summary: r.scope, evidence: [...r.evidence, ...linked.flatMap(c => c.evidence)], cases: r.cases, products: r.products, lineAt, ...own, ctx: `${r.title} ${r.company}`,
    });
  }
  for (const p of data.projects) {
    add(`project:${p.id}`, { kind: 'project', id: p.id, title: p.name, org: 'Side project', url: p.url, portfolio: base + p.anchor, summary: p.tagline, evidence: p.evidence, stack: p.built_with, end: data.updated.slice(0, 7), place: `project:${p.id}`, where: `${p.name} (side project)`, ctx: p.name });
  }
  const F = facts(data);
  const frecs = new Map();
  const frec = (ref, kind, title, url) => frecs.set(ref, { ref, kind, id: ref.split(':')[1], title, url });
  // ---- units: one per evidence line, one per typed fact. Fields carry the weights for search; ctx names the subject.
  const units = [];
  const unit = (ref, line, o = {}) => units.push({ ref, line, fact: !!o.fact, title: o.title || '', org: o.org || '', period: o.period || '', label: o.label || '', ctx: o.ctx || '', span: o.span || null });
  const spanOf = period => { const s = startOf(period); return s ? { s, e: endOf(period, data.updated) } : null; };
  for (const r of records.values()) {
    const own = r.kind === 'role' ? data.roles.find(x => x.id === r.id).evidence : r.evidence;
    const o = { title: r.title, org: r.org, period: r.period || '', ctx: r.ctx, span: spanOf(r.period) };
    for (const line of [r.summary, ...own]) unit(r.ref, line, o);
    if (r.kind === 'case') {
      unit(r.ref, `${r.title} (${r.org}, ${r.period})`, o);
      r.metric.label.split(';').map(x => x.trim()).forEach((part, k) => unit(r.ref, k === 0 ? `${r.metric.value} ${part}` : part, o));
    }
    if (r.stack?.length) unit(r.ref, `Built with: ${r.stack.join(', ')}`, o);
  }
  for (const h of p_headlines(data)) unit(h.ref, `${h.value} ${h.label}`, { title: records.get(h.ref)?.title, org: records.get(h.ref)?.org, ctx: records.get(h.ref)?.ctx, span: spanOf(records.get(h.ref)?.period) });
  const P = data.profile;
  const prof = (id, title, anchor) => frec(`profile:${id}`, 'profile', title, base + anchor);
  prof('current', 'Profile: current role', '#sec-hero');
  unit('profile:current', `${P.name}, ${P.headline}. Now: ${P.current.title}, ${P.current.company} (since ${P.current.since}). ${P.current.focus}`, { fact: true, title: 'current role', label: 'current now latest present role job position employer', ctx: `${P.name} ${P.headline}` });
  prof('location', 'Profile: location', '#sec-hero');
  unit('profile:location', P.location, { fact: true, title: 'location', label: 'location based lives city country where located', ctx: P.name });
  prof('open_to', 'Profile: availability', '#contact');
  unit('profile:open_to', P.open_to, { fact: true, title: 'availability', label: 'open availability relocation roles hiring looking looking seeking full-time', ctx: P.name });
  prof('visa', 'Profile: visa and travel', '#sec-hero');
  unit('profile:visa', P.travel, { fact: true, title: 'visa', label: 'visa work authorisation authorization travel permit status immigration', ctx: P.name });
  prof('experience', 'Profile: experience', '#sec-hero');
  unit('profile:experience', P.experience, { fact: true, title: 'years of experience', label: 'experience years seniority tenure', ctx: P.name });
  prof('education', 'Profile: education', '#sec-skills');
  unit('profile:education', P.education, { fact: true, title: 'education', label: 'education degree university college school studied study graduate graduated qualification', ctx: P.name });
  prof('summary', 'Profile: summary', '#sec-hero');
  unit('profile:summary', P.summary, { fact: true, title: 'summary', label: 'summary overview about', ctx: P.name });
  prof('contact', 'Profile: contact', '#contact');
  unit('profile:contact', P.contact.preferred, { fact: true, title: 'contact', label: 'contact reach email get in touch message hire', ctx: P.name });
  unit('profile:contact', `Email ${P.contact.email}; LinkedIn ${P.contact.linkedin}`, { fact: true, title: 'contact', label: 'contact reach email linkedin', ctx: P.name });
  prof('principles', 'Profile: principles', '#sec-manifesto');
  for (const x of data.principles) unit('profile:principles', x, { fact: true, title: 'principles', label: 'principles values manifesto approach', ctx: P.name });
  for (const e of F.employers) {
    const r = records.get(e.ref);
    unit(e.ref, `${e.title}, ${e.company}, ${e.period}, ${e.location}.`, { fact: true, title: e.title, org: e.company, period: e.period, label: `role job title position employer worked work company employment ${e.current ? 'current now latest present' : 'former past previous'}`, ctx: `${e.title} ${e.company}`, span: spanOf(e.period) });
  }
  const worked = F.employers.map(e => `${e.company} (${e.period})`).join('; ');
  prof('employers', 'Profile: employers', '#sec-experience');
  unit('profile:employers', `Employers: ${worked}.`, { fact: true, title: 'employers', label: 'employers companies worked work history career', ctx: P.name });
  for (const a of F.awards) {
    frec(a.ref, 'award', `Award: ${a.name}, ${a.org}, ${a.date}`, base + '#sec-recognition');
    unit(a.ref, `${a.name}, ${a.org}, ${a.date}: ${a.for}.`, { fact: true, title: a.name, org: a.org, period: a.date, label: 'award awards recognition won prize honour honor', ctx: a.org, span: { s: monthIso(a.date), e: monthIso(a.date) } });
  }
  for (const c of F.certifications) {
    frec(c.ref, 'certification', `Certification: ${c.name}, ${c.org}`, base + '#sec-recognition');
    unit(c.ref, `${c.name}, ${c.org}, ${c.date}.`, { fact: true, title: c.name, org: c.org, period: c.date, label: 'certification certifications certificate course badge training', ctx: c.org, span: { s: monthIso(c.date), e: monthIso(c.date) } });
  }
  for (const w of F.writing) {
    frec(w.ref, 'writing', `Writing: ${w.title}`, w.url);
    unit(w.ref, `${w.title}, Medium article, ${w.date}`, { fact: true, title: w.title, org: 'Medium', period: w.date, label: 'writing wrote written article articles blog post essay medium publication published', ctx: 'Medium', span: { s: w.date.slice(0, 7), e: w.date.slice(0, 7) } });
  }
  for (const g of F.skills) for (const a of g.areas) {
    frec(a.ref, 'skill', `Skills: ${g.group} · ${a.area}`, base + '#sec-skills');
    unit(a.ref, `${g.group} · ${a.area}: ${a.text}`, { fact: true, title: a.area, org: g.group, label: 'skill skills tools technologies stack knows proficient', ctx: g.group });
  }
  // search weights: index every unit's stems
  for (const u of units) {
    u.w = wordsOf(u.line);
    u.nums = numbersOf(u.line);
    u.dates = datesOf(u.line, data.updated);
    u.body = new Set(u.w.map(x => x.stem));
    u.lows = new Set(u.w.map(x => x.low));
    u.ctxS = new Set(wordsOf(u.ctx).map(x => x.stem));
    u.ctxL = new Set(wordsOf(u.ctx).map(x => x.low));
    u.fieldS = { title: new Set(wordsOf(u.title).map(x => x.stem)), org: new Set(wordsOf(u.org).map(x => x.stem)), period: new Set(wordsOf(u.period).map(x => x.stem)), label: new Set(wordsOf(u.label).map(x => x.stem)) };
    u.numS = new Set([...u.dates.map(d => String(d.y)), ...u.nums.map(n => String(n.value))]);
    u.neg = negScope(u.w.filter(x => !x.joined));
    u.pairs = pairsOf(u.line);
    u.pos = posScope(u.w.filter(x => !x.joined));
    u.ctxNums = numbersOf(u.ctx);
  }
  const df = new Map();
  for (const u of units) for (const t of new Set([...u.body, ...u.ctxS, ...Object.values(u.fieldS).flatMap(s => [...s])])) df.set(t, (df.get(t) || 0) + 1);
  const idf = t => Math.log(1 + units.length / (df.get(t) || 0.5));
  const vocab = new Set(), vocabAll = new Set();
  for (const u of units) {
    for (const t of u.body) { vocab.add(t); vocabAll.add(t); }
    for (const t of u.ctxS) { vocab.add(t); vocabAll.add(t); }
    for (const s of Object.values(u.fieldS)) for (const t of s) vocabAll.add(t);
  }
  const wholeWords = new Set(units.flatMap(u => u.w.filter(x => !x.joined && !x.part).map(x => x.low)));
  const names = new Set([...data.roles.map(r => r.company), ...data.projects.map(x => x.name), ...data.cases.map(c => c.org), ...data.cases.map(c => c.product || '')].flatMap(s => wordsOf(s)).map(x => x.stem));
  const tools = new Set();
  const toolSrc = [...Object.values(data.skills || {}).flatMap(g => Object.values(g)), ...data.cases.flatMap(c => [(c.stack || []).join(', ')]), ...data.projects.flatMap(x => [(x.built_with || []).join(', ')])];
  for (const s of toolSrc) for (const item of s.replace(/\([^)]*\)/g, ',').split(/[,;]/)) { const t = item.trim(); if (t && !/\s/.test(t) && /[A-Za-z]/.test(t)) tools.add(st(t)); }
  const comps = data.competencies.map(c => ({ ...c, res: c.keywords.map(k => ({ k, re: kwRegex(k) })) }));
  const out = { records, frecs, units, docs: units, idf, comps, vocab, vocabAll, wholeWords, names, tools, F };
  cache.set(data, out);
  return out;
}
const p_headlines = data => data.profile.headline_numbers || [];
const monthIso = s => { const d = datesOf(s)[0]; return d ? `${d.y}-${String(d.m || 1).padStart(2, '0')}` : null; };
// stems that occur at least once outside any negator's reach
function posScope(ws) {
  const bad = new Set();
  ws.forEach((w, k) => { if (NEGATORS.has(w.low) || NEGATORS.has(w.low.replace("'", ''))) for (let j = k + 1; j <= k + 4 && j < ws.length; j++) bad.add(j); });
  return new Set(ws.filter((w, k) => !bad.has(k)).map(w => w.stem));
}
// stems that sit within 3 words after a negator: "there are no network calls" -> {network, call}
function negScope(ws) {
  const s = new Set();
  ws.forEach((w, k) => { if (NEGATORS.has(w.low) || NEGATORS.has(w.low.replace("'", ''))) for (let j = k + 1; j <= k + 4 && j < ws.length; j++) s.add(ws[j].stem); });
  return s;
}

const brief = r => ({ ref: r.ref, kind: r.kind, id: r.id, title: r.title, url: r.url });
const recOf = (ix, ref) => ix.records.get(ref) || ix.frecs.get(ref);

/* ---------- profile, list, get, contact ---------- */
export function getProfile(data) {
  const p = data.profile;
  return {
    name: p.name, headline: p.headline, current: p.current, location: p.location, open_to: p.open_to, travel: p.travel,
    experience: p.experience, summary: p.summary, education: p.education, headline_numbers: p.headline_numbers,
    principles: data.principles, skills: data.skills, links: p.links,
  };
}

// the typed facts an AI can cite: employers with dates, education, location, visa, awards, certifications, skills
export function getFacts(data) {
  const F = facts(data);
  return { ...F, evidence_note: data.evidence_note };
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
  const { kind, id, title, org, period, url, summary, metric, evidence, stack, portfolio, cases, products } = r;
  return { ref: r.ref, kind, id, title, org, period, url, portfolio, summary, metric, evidence, stack, cases, products };
}

export function contact(data) {
  const p = data.profile;
  return { name: p.name, email: p.contact.email, linkedin: p.contact.linkedin, portfolio: p.links.portfolio, resume: p.links.resume, preferred: p.contact.preferred, open_to: p.open_to, location: p.location };
}

/* ================= search =================
   Every fact and every line is a document with weighted fields (title, organisation and period count more than
   the body). Question words are dropped; a small synonym map links "study" to education, "won" to awards and so on.
   Years and ranges in the question prefer records whose period overlaps. If a distinctive word in the question
   appears nowhere in the record, nothing is returned: no loosely related lines. */
const QUESTION = new Set(('who whom whose what when where which why how many much long did does do has have had is are was were be been he his him she her they it its parth parths tell me about show find list give any ever and or the a an of to in on at for with from by as that this these those there here can could should would will shall may might must our your you i we my us please get got looking look search whether if between during over since'.split(' ')));
const SEARCH_SYN = {
  study: 'education degree univers btech', studi: 'education degree univers btech', degree: 'education univers btech', univers: 'education degree btech', colleg: 'education univers', school: 'education univers', educat: 'degree univers btech', graduat: 'education degree univers', alumnu: 'education univers',
  award: 'award', recognit: 'award', win: 'award', prize: 'award', honour: 'award', honor: 'award',
  visa: 'visa', permit: 'visa', authoris: 'visa', authoriz: 'visa', immigr: 'visa', travel: 'visa',
  certif: 'certification', certificate: 'certification', badge: 'certification', course: 'certification',
  base: 'location', live: 'location', locat: 'location', cit: 'location', reloc: 'relocation open',
  now: 'current', current: 'current', latest: 'current', present: 'current', today: 'current',
  join: 'role period', start: 'role period', role: 'role title position', title: 'role', position: 'role', job: 'role', employ: 'role', company: 'role',
  write: 'writing article', writ: 'writing article', article: 'writing', blog: 'writing', essay: 'writing', post: 'writing',
  contact: 'contact', reach: 'contact email', email: 'contact', hire: 'contact open', avail: 'open',
  recipe: 'cookbook dish', cook: 'cookbook dish', food: 'cookbook dish', tracker: 'track', skill: 'skill', tool: 'skill', stack: 'skill built',
  year: 'experience', experienc: 'experience',
  dates: 'role period', date: 'role period', period: 'role period', tenure: 'role period', dat: 'role period',
};
const SEARCH_COMMON = stems('experience role status project work worked tool skill skills stack record evidence parth he his has have had does did can could used use using built build make made site app application company role person people thing time year years new old good best strong large small big team teams join joined start started current currently now latest present base based live lives lived');

function queryTerms(query, ix) {
  const ws = wordsOf(query).filter(w => !QUESTION.has(w.low) && !STOP.has(w.low));
  const terms = [], unknown = [];
  for (const w of ws) {
    const s = w.stem;
    const syn = (SEARCH_SYN[s] || SEARCH_SYN[w.low] || '').split(' ').filter(Boolean).map(st);
    const known = ix.vocabAll.has(s) || syn.length || SEARCH_COMMON.has(s) || COMMON.has(s);
    if (!known) { unknown.push(w.raw); continue; }
    if (ix.vocabAll.has(s) || syn.length) terms.push({ s, syn, w: SEARCH_COMMON.has(s) ? 0.4 : 1, raw: w.raw });
  }
  return { terms, unknown };
}

export function searchEvidence(data, query, limit = 8) {
  const ix = index(data);
  const { units, idf } = ix;
  const { terms, unknown } = queryTerms(query, ix);
  const qn = numbersOf(query).filter(n => !(Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2100));
  const qd = datesOf(query, data.updated);
  if (unknown.length) return [];
  if (!terms.length && !qn.length && !qd.length) return [];
  const win = qd.length ? { a: Math.min(...qd.map(d => d.y * 12 + (d.m || 1))), b: Math.max(...qd.map(d => d.y * 12 + (d.m || 12))) } : null;
  const FW = { title: 3, org: 2, period: 2, label: 2 };
  const denom = terms.reduce((s, t) => s + t.w * idf(t.s), 0) || 1;
  const scored = [];
  for (const u of units) {
    let s = 0, hit = 0;
    for (const t of terms) {
      let best = 0;
      const test = (x, k) => {
        if (u.body.has(x)) best = Math.max(best, 1 * k);
        for (const [f, wgt] of Object.entries(FW)) if (u.fieldS[f].has(x)) best = Math.max(best, wgt * k);
      };
      test(t.s, 1);
      for (const x of t.syn) test(x, 0.7);
      if (best) { s += idf(t.s) * t.w * (0.5 + 0.5 * Math.min(best, 3) / 1.5); hit += idf(t.s) * t.w; }
    }
    for (const n of qn) if (u.nums.some(m => Math.abs(m.value - n.value) < 1e-9)) { s += 2; hit += 2; }
    if (!hit) continue;
    const cover = hit / (denom + qn.length * 2);
    if (cover < 0.55) continue;
    s *= 0.5 + 0.5 * Math.min(cover, 1);
    if (win) {
      let f = 0.6;
      if (u.span) {
        const a = ym(u.span.s), b = ym(u.span.e);
        const o = Math.min(b, win.b) - Math.max(a, win.a) + 1;
        f = o > 0 ? 0.5 + 0.5 * Math.min(1, o / (win.b - win.a + 1)) : 0.12;
      } else if (qd.some(d => u.dates.some(x => x.y === d.y))) f = 1;
      s *= f;
    }
    if (u.fact) s *= 1.15;
    scored.push({ s, u });
  }
  scored.sort((a, b) => b.s - a.s);
  const seen = new Set();
  const out = [];
  const floor = (scored[0]?.s || 0) * 0.3;
  for (const { s, u } of scored) {
    if (s < floor) break;
    if (seen.has(u.line)) continue;
    seen.add(u.line);
    out.push({ ...brief(recOf(ix, u.ref)), quote: u.line, score: Math.round(s * 10) / 10 });
    if (out.length >= limit) break;
  }
  return out;
}

/* ================= prove a claim =================
   A claim is split into the parts that decide it: named things (companies, banks, networks, tools, places, titles),
   numbers with their units, dates, and absolute words (never, every, all). It is "supported" only when every one of
   those parts is present together in ONE line or ONE typed fact. A name the record never mentions gives not_found;
   a known subject with a different name, number, place or date gives differs, quoting what the record says;
   "never/every/all" beyond what the record states gives differs with the scope the record does give. */
const FRAMELOW = new Set([...STOP, 'been', 'being', 'had', 'experience', 'cover', 'covers', 'include', 'includes', 'contain', 'contains', 'dated', 'date', 'worked', 'work', 'works', 'working']);
const UNITWORDS = stems('year day week month hour minute second percent cent time lakh crore thousand million billion');
const SLOT_STEMS = stems('sponsor bank rails rail network partner launch issuer processor');
const CAPFRAME = new Set('the he his she it this that in at on by an a and or but if so we our they every all one also his her their parth aggarwal there here is are was were to of for from with as'.split(' '));
const ROLE_NOUNS = stems('manager engineer officer director lead head intern analyst scientist designer architect developer owner consultant president executive specialist');
const TITLE_MODS = stems('senior junior staff principal lead head chief technical product program project platform forward deployed associate group vp director software data backend frontend full stack growth marketing sales operations executive of');
const EMP_CUES = stems('work employ join hire promot title role position tenure leave resign since');
const TITLE_SET = stems('senior junior staff principal chief head vp intern associate group software technical product program project forward deployed platform data growth marketing sales operations executive');

// each figure with the first words that follow it: "76 snooker, 52 pool" -> [{v:76, s:'snooker'}, {v:52, s:'pool'}]
function pairsOf(text) {
  const toks = normNum(text).match(/[~$₹]?\d[\d,]*(?:\.\d+)?[kmb%x+]*|[A-Za-z][A-Za-z'-]*/g) || [];
  const out = [];
  toks.forEach((tk, i) => {
    if (!/\d/.test(tk)) return;
    const v = parseFloat(tk.replace(/[^\d.]/g, ''));
    let n = 0;
    for (let j = i + 1; j < toks.length && n < 1 && j <= i + 3; j++) {
      if (/\d/.test(toks[j])) break;
      const low = toks[j].toLowerCase();
      if (STOP.has(low) || FRAME.has(st(low))) continue;
      out.push({ v, raw: tk, s: st(low), w: toks[j] }); n++;
    }
  });
  return out;
}
function analyseClaim(ix, claim, data) {
  const text = normClaim(claim);
  const all = wordsOf(stripDates(text));
  const w = all.filter(x => !x.joined);
  const nums = numbersOf(text);
  const terms = [], absolutes = [];
  const total = ix.units.length;
  const hardW = Math.log(1 + total / 0.5), weakW = 1;
  for (const x of w) {
    if (x.low === 'parth' || x.low === 'aggarwal') continue;
    if (ABSOLUTE.has(x.low)) { absolutes.push(x); continue; }
    if (NEGATORS.has(x.low)) continue;
    if (FRAMELOW.has(x.low) || (!x.cap && FRAME.has(x.stem))) continue;
    if (nums.length && UNITWORDS.has(x.stem)) continue;
    if (x.low === 'zero' && nums.some(n => n.value === 0)) continue;
    if (x.low.length === 1) continue;
    if (!x.cap && (GLUE.has(x.stem) || NUMWORDS[x.low])) continue;
    const capEnt = x.cap && !CAPFRAME.has(x.low) && (x.i > 0 || ix.names.has(x.stem) || x.caps);
    const known0 =  x.low.length <= 3 && x.cap ? ix.wholeWords.has(x.low) || (x.part && ix.vocab.has(x.stem)) : alts(x.stem).some(a => ix.vocab.has(a));
    const entity = capEnt || (x.caps && x.low.length > 1) || ix.tools.has(x.stem) || (x.i === 0 && x.cap && !known0);
    const known = x.low.length <= 3 && x.cap ? ix.wholeWords.has(x.low) || (x.part && ix.vocab.has(x.stem)) : alts(x.stem).some(a => ix.vocab.has(a));
    let unk = null;
    if (!known) unk = entity && !COMMON.has(x.stem) ? 'hard' : (COMMON.has(x.stem) || /(ed|ing|ly)$/.test(x.low)) ? 'weak' : 'soft';
    const light = !entity && LIGHT.has(x.stem);
    const wt = (unk === 'hard' || unk === 'soft' ? hardW : unk === 'weak' ? weakW : ix.idf(x.stem) * (entity ? 1.4 : 1)) * (light && !unk ? 0.35 : 1);
    terms.push({ light, s: x.stem, raw: x.raw, low: x.low, entity, unk, w: wt, i: x.i, cap: x.cap, part: x.part });
  }
  const neg = negScope(w);
  const hasNeg = w.some(x => NEGATORS.has(x.low));
  const pairs = pairsOf(text);
  const ft = text.match(/\bfrom\s+(\S+(?:\s+[a-z]+)?)\s+to\s+(\S+)/i);
  const fromTo = ft && nums.length >= 2 ? [numbersOf(ft[1])[0], numbersOf(ft[2])[0]].filter(Boolean) : null;
  return { pairs, fromTo: fromTo && fromTo.length === 2 ? fromTo : null, text, w, terms, nums, dates: datesOf(text, data.updated), absolutes, neg, hasNeg, stemSet: new Set(w.map(x => x.stem)) };
}

const hasS = (u, s) => alts(s).some(a => u.body.has(a) || u.ctxS.has(a)) || (s === st('double') && u.nums.some(n => n.value === 2 && n.cls === 'x'));
const dirOf = s => (UP.has(s) ? 1 : DOWN.has(s) ? -1 : 0);
// a proper name must appear as the same word (Track is not "tracking")
const hasT = (u, t) => (t.entity && t.cap && t.low.length > 3 ? [t.low, t.low.replace(/s$/, ''), t.low + 's'].some(l => u.lows.has(l) || u.ctxL.has(l)) : hasS(u, t.s));
function evalUnit(C, u, skip = null) {
  const ents = C.terms.filter(t => t.entity && !t.unk && t !== skip);
  const entMiss = ents.filter(t => !hasT(u, t));
  let mw = 0, tw = 0, kw = 0, km = 0;
  for (const t of C.terms) {
    if (t === skip) continue;
    tw += t.w;
    if (t.unk === 'hard' || t.unk === 'soft' || t.unk === 'weak') continue;
    kw += t.w;
    if (hasT(u, t)) { mw += t.w; km += t.w; }
  }
  const nm = [], nx = [], nu = [];
  for (const n of C.nums) {
    if (u.nums.some(m => numEq(n, m)) || u.ctxNums.some(m => m.value === n.value)) nm.push(n);
    else if (u.nums.some(m => comparable(n, m))) nx.push(n);
    else nu.push(n);
  }
  const dm = [], dx = [];
  for (const d of C.dates) (dateMatch(d, u.dates) ? dm : dx).push(d);
  const absMiss = C.absolutes.filter(a => !u.w.some(x => x.low === a.low));
  const conflicts = C.terms.filter(t => !t.unk && hasS(u, t.s) && (C.neg.has(t.s) !== u.neg.has(t.s)) && !(!C.neg.has(t.s) && u.pos.has(t.s)));
  // direction: "increased" against a line that only says "reduced" (and the reverse)
  const udir = new Set(u.w.map(x => dirOf(x.stem)).filter(Boolean));
  for (const t of C.terms) { const d = dirOf(t.s); if (d && udir.size && !udir.has(d) && !conflicts.includes(t)) conflicts.push({ ...t, direction: true }); }
    // "52 about snooker and 76 about pool": each figure must sit next to the same word in the line
  for (const p of C.pairs) {
    if (u.pairs.some(q => q.v === p.v && q.s === p.s)) continue;
    const swap = C.pairs.find(c => c.v !== p.v && c.s !== p.s && u.pairs.some(q => q.v === p.v && q.s === c.s) && u.pairs.some(q => q.v === c.v && q.s === p.s));
    if (swap) conflicts.push({ raw: `${p.raw} ${p.w}`, direction: true });
  }
  // "from A to B": the two figures must come in the same order in the line
  if (C.fromTo) {
    const [a, b] = C.fromTo;
    const ia = u.nums.findIndex(m => numEq(a, m)), ib = u.nums.findIndex(m => numEq(b, m));
    if (ia >= 0 && ib >= 0 && ia > ib) conflicts.push({ raw: `${a.raw} to ${b.raw}`, direction: true });
  }
  const wordMiss = C.terms.filter(t => !t.unk && t !== skip && !hasT(u, t));
  const cover = tw ? mw / tw : 0;
  const knownCover = kw ? km / kw : 0;
  return { u, entMiss, wordMiss, cover, knownCover, nm, nx, nu, dm, dx, absMiss, conflicts, mw, score: mw + 2.5 * nm.length + 2.5 * dm.length - 1.2 * nx.length };
}
const topical = (e, C) => e.mw > 0 && !e.entMiss.length && e.knownCover >= (C.terms.some(t => t.entity && !t.unk) ? 0.5 : 0.6);

// a name in the claim sits where the record has a different name: the same words either side, a different name
// between them, in a slot that holds one value (sponsor bank, card network, partner bank, a named tool)
function substitution(C, term, rows) {
  const cw = C.w;
  const k = cw.findIndex(x => x.i === term.i);
  if (k < 0) return null;
  if (C.terms.some(t => t !== term && t.unk)) return null;
  const before = cw.slice(Math.max(0, k - 5), k), after = cw.slice(k + 1, k + 6);
  const cs = C.stemSet;
  const isSlot = x => SLOT_STEMS.has(x.stem) || (x.caps && x.low.length <= 3);
  for (const r of rows.slice(0, 14)) {
    const uw = r.u.w.filter(x => !x.joined);
    for (let q = 0; q < uw.length; q++) {
      if (!uw[q].cap || cs.has(uw[q].stem)) continue;
      let filler = null;
      // the same word right before the name, and a shared anchor within three words before
      if (before.length && uw[q - 1] && uw[q - 1].stem === before[before.length - 1].stem) {
        const win = uw.slice(Math.max(0, q - 5), q);
        const shared = before.filter(x => win.some(y => y.stem === x.stem) && !STOP.has(x.low));
        if (shared.some(isSlot)) {
          const f = []; for (let j = q; j < uw.length && uw[j].cap && !cs.has(uw[j].stem); j++) f.push(uw[j].raw);
          if (f.length) filler = f.join(' ');
        }
      }
      // the same word right after the name, and a shared anchor within three words after
      if (!filler && after.length && uw[q + 1] && uw[q + 1].stem === after[0].stem) {
        const win = uw.slice(q + 1, q + 7);
        const shared = after.filter(x => win.some(y => y.stem === x.stem) && !STOP.has(x.low));
        if (shared.some(isSlot)) {
          const f = []; for (let j = q; j >= 0 && uw[j].cap && !cs.has(uw[j].stem); j--) f.unshift(uw[j].raw);
          if (f.length) filler = f.join(' ');
        }
      }
      if (filler) {
        const rest = evalUnit(C, r.u, term);
        if (!rest.entMiss.length && !rest.nx.length && !rest.nu.length && rest.knownCover >= 0.7 && rest.wordMiss.length <= 1 && !rest.dx.length && !rest.absMiss.length) return { filler, row: r };
      }
    }
  }
  return null;
}

const GAP_EXTRA = /\b(?:pms?|product managers?)\b[^.]*\b(?:report\w*|direct reports?|managed by|manag\w+ them)\b|\b(?:manag\w+|hir\w+|supervis\w+|coach\w+)\b[^.]*\b(?:pms|product managers)\b/i;

export function proveClaim(data, claim) {
  const ix = index(data);
  const { records, units } = ix;
  const C = analyseClaim(ix, claim, data);
  const ev = us => [...new Map(us.map(u => [u.line, u])).values()].slice(0, 3).map(u => ({ ...brief(recOf(ix, u.ref)), quote: u.line }));
  const res = (verdict, explanation, us = [], checked = {}) => ({ claim, verdict, explanation, evidence: ev(us), checked: finishChecked(C, checked) });
  if (!C.terms.length && !C.nums.length && !C.dates.length) return res('not_found', 'The claim has no names, numbers or dates to check against the record.');

  // 1. a recorded gap (e.g. managing PMs); a plain title claim naming one of his employers is checked as a role first
  if (!C.hasNeg && ix.F.employers.some(e => wordsOf(e.company).every(x => C.stemSet.has(x.stem)))) {
    const t = roleCheck(data, ix, C);
    if (t) return res(t.verdict, t.explanation, t.units, t.checked);
  }
  const gap = detect(claim, ix.comps).find(f => f.c.strength === 'gap');
  const gapHit = gap || (GAP_EXTRA.test(claim) && !C.hasNeg ? { c: ix.comps.find(c => c.strength === 'gap') } : null);
  if (gapHit && gapHit.c) return res('not_supported', `Not supported. ${gapHit.c.note}`, [], { typed: 'gap' });

  // 2. typed checks: role, education, location, visa, years
  if (!C.hasNeg) {
    const typed = roleCheck(data, ix, C) || educationCheck(data, ix, C) || locationCheck(data, ix, C) || visaCheck(data, ix, C) || yearsCheck(data, ix, C);
    if (typed) return res(typed.verdict, typed.explanation, typed.units, typed.checked);
  }

  // 3. every line and fact, scored against the decisive parts
  const rows = units.map(u => evalUnit(C, u)).filter(r => r.mw > 0 || r.nm.length || r.dm.length).sort((a, b) => b.score - a.score);
  const unknown = C.terms.filter(t => t.unk === 'hard' || t.unk === 'soft');
  const weak = C.terms.filter(t => t.unk === 'weak');
  const decisive = C.terms.length + C.nums.length + C.dates.length;
  // 'certification', 'course' and 'award' only count when the line is a certification or an award on the record
  const kinds = [/\b(certif\w*|certificate|course|badge)\b/i.test(C.text) ? 'cert:' : null, /\b(awards?|awarded|prize)\b/i.test(C.text) ? 'award:' : null].filter(Boolean);

  const kindOk = r => kinds.every(k => r.u.ref.startsWith(k));
  const ok = r => kindOk(r) && !unknown.length && weak.length <= 2 && !r.entMiss.length && r.cover >= 0.72 && (r.wordMiss.every(t => t.light) && r.wordMiss.length <= 3 || (r.nm.length + r.dm.length >= 2 && r.cover >= 0.7 && r.wordMiss.filter(t => !t.light).length <= 1 && !r.wordMiss.some(t => t.entity))) && !r.nx.length && !r.nu.length && !r.dx.length && !r.absMiss.length && !r.conflicts.length;
  const good = rows.filter(ok);
  if (good.length && decisive) return res('supported', 'Supported: the record states this, quoted below.', good.map(r => r.u), { best: good[0] });

  const best = rows.length ? rows.filter(r => r.score >= rows[0].score * 0.7).sort((a, b) => a.entMiss.length - b.entMiss.length || b.score - a.score)[0] : undefined;
  if (!best) return res('not_found', unknown.length ? `The record never mentions ${list(unknown.map(t => t.raw))}. Do not repeat the claim as fact; ask Parth.` : 'No evidence for this claim in the record. Do not repeat it as fact; ask Parth.', [], { unknown });
  const topRows = rows.filter(r => topical(r, C));
  const near = topRows.find(r => r.absMiss.length || r.conflicts.length) || topRows[0] || best;

  // absolute overclaim: the record states it for a specific scope only
  const absRow = rows.find(r => r.absMiss.length && r.mw >= 2 && r.knownCover >= 0.25 && !r.entMiss.length);
  if (absRow) {
    return res('differs', `Overclaim: "${absRow.absMiss.map(a => a.raw).join('", "')}" goes beyond the record, which states this only for the scope quoted below.`, rows.filter(r => r.knownCover >= 0.25 && r.mw >= 2 && !r.entMiss.length).slice(0, 3).map(r => r.u), { best: absRow, absRow });
  }
  const polRow = unknown.length ? null : rows.find(r => r.conflicts.length && topical(r, C));
  if (polRow) return res('differs', `Not as stated: the record says the opposite or something different here (${polRow.conflicts.some(t => t.direction) ? `${list(polRow.conflicts.map(t => t.raw))} points the other way` : `${list(polRow.conflicts.map(t => t.raw))} is negated on one side only`}). Quoted below.`, [polRow.u], { best: polRow });

  // a name the record never mentions: a different name in the same slot, or simply not found
  if (unknown.length) {
    const hard = unknown.filter(t => t.unk === 'hard');
    if (hard.length === 1 && unknown.length === 1) {
      const sub = substitution(C, hard[0], rows);
      if (sub) return res('differs', `Not as stated: where you said ${hard[0].raw} the record has a different name (${sub.filler}). See the quoted line.`, [sub.row.u], { best: sub.row, sub: { term: hard[0], filler: sub.filler } });
    }
    return res('not_found', `The record never mentions ${list(unknown.map(t => t.raw))}. Do not repeat the claim as fact; ask Parth.`, [], { unknown });
  }
  const numRow = topRows.find(r => r.nx.length);
  if (numRow && weak.length <= 2) {
    return res('differs', `Not as stated: you said ${list(numRow.nx.map(n => n.raw))}; the record says ${list(numRow.u.nums.filter(m => numRow.nx.some(n => comparable(n, m))).map(m => m.raw))}. Use the quoted figures instead.`, topRows.filter(r => r.nx.length).slice(0, 3).map(r => r.u), { best: numRow });
  }
  const dateRow = topRows.find(r => r.dx.length && r.u.dates.length);
  if (dateRow && !weak.length) {
    return res('differs', `Not as stated: you said ${list(dateRow.dx.map(d => fmtDate(d)))}; the record says ${list(dateRow.u.dates.map(d => fmtDate(d)))}.`, topRows.filter(r => r.dx.length && r.u.dates.length).slice(0, 3).map(r => r.u), { best: dateRow });
  }
  // known names that never appear together
  for (const r of rows.slice(0, 8)) {
    if (r.entMiss.length !== 1) continue;
    const sub = substitution(C, r.entMiss[0], rows);
    if (sub) return res('differs', `Not as stated: where you said ${r.entMiss[0].raw} the record has a different name (${sub.filler}). See the quoted line.`, [sub.row.u], { best: sub.row, sub: { term: r.entMiss[0], filler: sub.filler } });
  }
  const lonely = best.entMiss;
  if (lonely.length) {
    if (lonely.length === 1) {
      const sub = substitution(C, lonely[0], rows);
      if (sub) return res('differs', `Not as stated: where you said ${lonely[0].raw} the record has a different name (${sub.filler}). See the quoted line.`, [sub.row.u], { best: sub.row, sub: { term: lonely[0], filler: sub.filler } });
    }
    const where = units.filter(u => lonely.some(t => hasS(u, t.s))).slice(0, 2);
    return res('not_found', `No single line or fact on the record states this: ${list(lonely.map(t => t.raw))} appears only in other contexts, never with ${list(C.terms.filter(t => !t.unk && !lonely.includes(t)).map(t => t.raw))}. The closest lines are quoted for context; they do not support the claim.`, where, { best });
  }
  if (best.cover >= 0.6 && !best.nx.length && !best.dx.length && !weak.length && !best.nu.length && best.wordMiss.length <= 1 && C.terms.filter(t => !t.entity).length >= 3) {
    return res('partial', 'Partly supported: related evidence exists, but not this exact claim. Quote the evidence rather than the claim.', rows.slice(0, 3).map(r => r.u), { best });
  }
  if (best.nu.length || best.dx.length) return res('not_found', `The record has nothing on ${list([...best.nu.map(n => n.raw), ...best.dx.map(d => fmtDate(d))])} for this. Do not repeat the claim as fact; ask Parth.`, [], { best });
  return res('not_found', 'No evidence for this claim in the record. Do not repeat it as fact; ask Parth.', [], { best });
}

const list = a => { const x = [...new Set(a)]; return x.length > 1 ? `${x.slice(0, -1).join(', ')} and ${x[x.length - 1]}` : x[0] || ''; };
const fmtDate = d => (d.m ? `${MONTH_NAMES[d.m - 1].slice(0, 3)} ${d.y}` : String(d.y));

// what was extracted from the claim and how each part fared, so a caller can see the basis
function finishChecked(C, o) {
  const best = o.best;
  const entities = C.terms.filter(t => t.entity).map(t => ({
    text: t.raw,
    status: t.unk ? 'not on record' : o.typed || o.sub?.term === t ? (o.sub?.term === t ? 'conflicts' : 'matched') : best ? (hasS(best.u, t.s) ? 'matched' : 'elsewhere on record') : 'matched',
  }));
  const numbers = C.nums.map(n => ({ text: n.raw, status: o.typed ? 'checked' : best ? (best.nm.includes(n) ? 'matched' : best.nx.includes(n) ? 'differs' : 'not on record') : 'not on record' }));
  const dates = C.dates.map(d => ({ text: fmtDate(d), status: o.typed ? 'checked' : best ? (best.dm.includes(d) ? 'matched' : best.dx.includes(d) ? 'differs' : 'not on record') : 'not on record' }));
  const absolutes = C.absolutes.map(a => ({ word: a.raw, status: best ? (best.absMiss.includes(a) ? 'not in the record line' : 'in the record line') : 'not in the record line' }));
  const unknown = C.terms.filter(t => t.unk === 'hard' || t.unk === 'soft').map(t => t.raw);
  return { entities, numbers, dates, absolutes, unknown, typed: o.typed || null, basis: best ? best.u.ref : (o.basis || null) };
}

/* ---------- typed checks ---------- */
const hasStem = (C, s) => C.stemSet.has(s);
const unitFor = (ix, ref, re) => ix.units.find(u => u.ref === ref && (!re || re.test(u.line)));
const cur = data => data.updated.slice(0, 7);

function roleCheck(data, ix, C) {
  const F = ix.F;
  const empl = F.employers;
  const mentioned = [...new Set(empl.filter(e => wordsOf(e.company).every(x => hasStem(C, x.stem))).map(e => e.company))];
  const titleNounIn = C.w.some(x => ROLE_NOUNS.has(x.stem));
  const cue = C.w.some(x => EMP_CUES.has(x.stem));
  if (!mentioned.length && !titleNounIn && !cue) return null;
  if (!cue && !C.w.some(x => ['is', 'was', 'am'].includes(x.low))) return null;
  // everything in the claim must be explained by employers, titles, dates and employment words
  const titleStems = new Set(empl.flatMap(e => wordsOf(e.title).map(x => x.stem)));
  const empStems = new Set(empl.flatMap(e => wordsOf(e.company).map(x => x.stem)));
  const placeStems = new Set(empl.flatMap(e => wordsOf(e.location).map(x => x.stem)));
  const claimTitle = new Set(C.w.filter(x => ROLE_NOUNS.has(x.stem) || TITLE_MODS.has(x.stem) || titleStems.has(x.stem)).map(x => x.stem));
  const unexplained = C.terms.filter(t => !empStems.has(t.s) && !claimTitle.has(t.s) && !EMP_CUES.has(t.s) && !placeStems.has(t.s) && !['present', 'date', 'until', 'till', 'month', 'year'].includes(t.s));
  if (C.nums.length) return null;
  if (!mentioned.length && (cue || (titleNounIn && C.w.some(x => ['is', 'was', 'am'].includes(x.low))))) {
    const m = C.text.match(/\b(?:at|for|joined|joining|with)\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/);
    if (m && !unexplained.filter(t => !wordsOf(m[1]).some(x => x.stem === t.s)).length && /\b(?:work\w*|employ\w*|join\w*|hired|promot\w*|role|position|title|manager|engineer|officer|director|lead|head|intern|analyst|scientist|designer|architect|developer|owner|consultant)\b/i.test(C.text)) {
      const nm = m[1];
      const unitsOf = ix.units.filter(u => wordsOf(nm).every(x => u.body.has(x.stem))).slice(0, 2);
      const known = unitsOf.length > 0;
      return { verdict: 'not_found', explanation: `${known ? `${nm} appears in the record, but not as an employer.` : `The record never mentions ${nm}.`} His employers on record: ${empl.map(e => `${e.company} (${e.period})`).join('; ')}.`, units: known ? unitsOf : empl.map(e => ix.units.find(u => u.ref === e.ref && u.fact)), checked: { typed: 'role' } };
    }
  }
  if (unexplained.length) return null;
  if (!mentioned.length && !titleNounIn) return null;
  const claimT = new Set(C.w.filter(x => ROLE_NOUNS.has(x.stem) || TITLE_SET.has(x.stem)).map(x => x.stem));
  const present = C.w.some(x => ['currently', 'now', 'today', 'presently'].includes(x.low)) || (C.w.some(x => ['is', 'works', 'am'].includes(x.low)) && !C.w.some(x => ['was', 'worked', 'previously', 'formerly', 'held', 'had'].includes(x.low)));
  const startCue = C.w.some(x => ['join', 'joined', 'joins', 'started', 'start', 'began', 'since', 'from', 'hired', 'joining'].includes(x.low));
  const endCue = C.w.some(x => ['until', 'till', 'left', 'ended', 'through'].includes(x.low));
  const dates = C.dates;
  const nowMonth = cur(data);
  const roleSpan = r => ({ s: r.start, e: r.end || nowMonth });
  const dateOk = r => {
    if (!dates.length) return true;
    const sp = roleSpan(r);
    const eq = (d, iso) => { const [y, m] = iso.split('-').map(Number); return d.y === y && (d.m == null || d.m === m); };
    const within = d => { const [sy, sm] = sp.s.split('-').map(Number), [ey, em] = sp.e.split('-').map(Number); const v = d.y * 12 + (d.m || 6); return d.m ? v >= sy * 12 + sm && v <= ey * 12 + em : d.y >= sy && d.y <= ey; };
    const real = dates.filter(d => !d.present);
    const toPresent = dates.some(d => d.present);
    if (real.length >= 2 || (real.length === 1 && toPresent)) {
      if (!eq(real[0], sp.s)) return false;
      if (toPresent) return !r.end;
      return eq(real[1], sp.e);
    }
    const d = real[0];
    if (!d) return toPresent ? !r.end : true;
    if (startCue) return eq(d, sp.s);
    if (endCue) return eq(d, sp.e);
    return within(d);
  };
  const titleOk = r => {
    const rt = new Set(wordsOf(r.title).map(x => x.stem));
    return [...claimT].every(s => rt.has(s) || (s === 'of'));
  };
  const lineOf = r => unitFor(ix, r.ref, /,\s/ );
  const roleUnit = r => ix.units.find(u => u.ref === r.ref && u.fact);
  const explain = rs => rs.map(r => `${r.title}, ${r.company} (${r.period})`).join('; ');
  const checkedBase = { typed: 'role' };

  if (mentioned.length) {
    const good = [], bad = [];
    for (const company of mentioned) {
      const roles = empl.filter(e => e.company === company);
      // no title in the claim: the dates are about the whole tenure at that employer
      const merged = { start: roles.map(r => r.start).sort()[0], end: roles.some(r => !r.end) ? null : roles.map(r => r.end).sort().pop(), current: roles.some(r => r.current), title: '' };
      const pick = !claimT.size && dates.length && dateOk(merged) && (!present || merged.current) ? roles : roles.filter(r => titleOk(r) && dateOk(r) && (!present || r.current));
      if (pick.length) good.push(...pick); else bad.push({ company, roles });
    }
    if (!bad.length) return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: good.map(roleUnit), checked: checkedBase };
    const b = bad[0];
    const titleMatch = b.roles.filter(titleOk);
    const why = claimT.size && !titleMatch.length ? `his title${b.roles.length > 1 ? 's' : ''} at ${b.company} ${b.roles.length > 1 ? 'were' : 'was'} ${list(b.roles.map(r => `${r.title} (${r.period})`))}`
      : present && titleMatch.length && !titleMatch.some(r => r.current) ? `he is not at ${b.company} now: ${explain(titleMatch)}${empl.find(e => e.current) ? `; he has been at ${empl.find(e => e.current).company} since ${empl.find(e => e.current).period.split(' - ')[0]}` : ''}`
      : `the record has ${explain(titleMatch.length ? titleMatch : b.roles)}`;
    return { verdict: 'differs', explanation: `Not as stated: ${why}.`, units: (titleMatch.length ? titleMatch : b.roles).map(roleUnit), checked: checkedBase };
  }
  // title only
  if (!claimT.size) return null;
  const pick = empl.filter(r => titleOk(r) && dateOk(r) && (!present || r.current));
  if (pick.length) return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: pick.map(roleUnit), checked: checkedBase };
  const hs = new Set(wordsOf(F.headline).map(x => x.stem));
  if (!dates.length && [...claimT].every(x => hs.has(x))) return { verdict: 'supported', explanation: 'Supported: this is his headline title on the record.', units: [ix.units.find(u => u.ref === 'profile:current')], checked: checkedBase };
  const tm = empl.filter(titleOk);
  if (tm.length) return { verdict: 'differs', explanation: `Not as stated: the record has ${explain(tm)}.`, units: tm.map(roleUnit), checked: checkedBase };
  return { verdict: 'not_found', explanation: `No such title on the record. His titles: ${explain(empl)}.`, units: empl.map(roleUnit), checked: checkedBase };
}

function educationCheck(data, ix, C) {
  const F = ix.F, ed = F.education;
  const cue = C.w.some(x => ['btech', 'degree', 'bachelor', 'master', 'mba', 'phd', 'doctorate', 'msc', 'mtech', 'studied', 'study', 'graduated', 'graduate', 'university', 'college', 'alumnus', 'diploma', 'pes', 'educated', 'majored'].includes(x.low));
  if (!cue) return null;
  const unit = ix.units.find(u => u.ref === 'profile:education');
  const checked = { typed: 'education' };
  if (C.w.some(x => ['master', 'mba', 'phd', 'doctorate', 'msc', 'mtech', 'postgraduate'].includes(x.low)) && !C.w.some(x => ['btech', 'bachelor'].includes(x.low))) {
    return { verdict: 'not_found', explanation: `The record lists a ${ed.degree} only (${ed.school}); it never mentions a master's degree, MBA or PhD.`, units: [unit], checked };
  }
  const hasDegree = C.w.some(x => ['btech', 'bachelor', 'degree'].includes(x.low));
  const hasSchool = C.w.some(x => ['pes', 'univers'].includes(x.stem) || x.low === 'pes');
  const studyCue = C.w.some(x => ['studied', 'study', 'graduated', 'graduate', 'attended', 'majored', 'educated'].includes(x.low));
  if (!hasDegree && !hasSchool && !studyCue) return null;
  const residual = C.terms.filter(t => !hasS(unit, t.s) && ![st('btech'), st('degree'), st('bachelor'), st('studied'), st('study'), st('graduated'), st('graduate'), st('university'), st('college'), st('educated')].includes(t.s));
  if (!hasDegree && !hasSchool && residual.length) return null;
  if (residual.length) {
    const fieldWords = residual.filter(t => !t.entity || true).map(t => t.raw);
    return { verdict: 'differs', explanation: `Not as stated: the record has ${ed.degree}, ${ed.field}${ed.specialisation ? ` (${ed.specialisation})` : ''}, ${ed.school}, ${ed.city}, ${ed.start}-${ed.end}; it does not mention ${list(fieldWords)}.`, units: [unit], checked };
  }
  const years = C.dates.map(d => d.y);
  if (years.some(y => y !== ed.start && y !== ed.end) || C.nums.some(n => n.value >= 1000 && !n.cls && n.value !== ed.start && n.value !== ed.end)) return { verdict: 'differs', explanation: `Not as stated: the record has ${ed.degree}, ${ed.school}, ${ed.start}-${ed.end}.`, units: [unit], checked };
  return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: [unit], checked };
}

function locationCheck(data, ix, C) {
  const F = ix.F, loc = F.location;
  if (!/\b(based|located|resid(?:es?|ed|ing)|lives?\s+in|lived\s+in|living\s+in|relocated|relocating|moved\s+to|moving\s+to)\b/i.test(C.text)) return null;
  const placeCaps = C.terms.filter(t => t.entity);
  const unknown = placeCaps.filter(t => t.unk);
  const checked = { typed: 'location' };
  const cityS = st(loc.city), countryS = st(loc.country);
  const roleLocs = new Set(F.employers.flatMap(e => wordsOf(e.location).map(x => x.stem)).concat(wordsOf(F.education.city || '').map(x => x.stem)));
  const locUnit = ix.units.find(u => u.ref === 'profile:location');
  const pastCue = C.w.some(x => ['lived', 'moved', 'relocated', 'worked'].includes(x.low));
  const presentCue = !/\b(lived|moved|relocated|worked)\b/i.test(C.text);
  if (unknown.length) return presentCue ? { verdict: 'differs', explanation: `Not as stated: the record says he is based in ${loc.text}; it never mentions ${list(unknown.map(t => t.raw))}.`, units: [locUnit], checked } : { verdict: 'not_found', explanation: `The record never mentions ${list(unknown.map(t => t.raw))}. He is based in ${loc.text}.`, units: [locUnit], checked };
  if (!placeCaps.length) return null;
  const places = placeCaps.map(t => t.s);
  if (!pastCue) {
    const wrong = placeCaps.filter(t => t.s !== cityS && t.s !== countryS);
    if (wrong.length) return { verdict: 'differs', explanation: `Not as stated: the record says he is based in ${loc.text}${roleLocs.has(wrong[0].s) ? ` (he worked in ${wrong[0].raw} until Aug 2026)` : ''}.`, units: [locUnit], checked };
    return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: [locUnit], checked };
  }
  const never = placeCaps.filter(t => !roleLocs.has(t.s));
  if (never.length) return { verdict: 'not_found', explanation: `The record places him in ${loc.text} and, in earlier roles and at university, in Bengaluru; it never mentions ${list(never.map(t => t.raw))}.`, units: [locUnit], checked };
  return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: F.employers.filter(e => placeCaps.some(t => wordsOf(e.location).some(x => x.stem === t.s))).map(e => ix.units.find(u => u.ref === e.ref && u.fact)), checked };
}

function visaCheck(data, ix, C) {
  const t = C.text.toLowerCase();
  const docVisa = /\bvisa\b/.test(C.text) || /\bVisa\s+(?:status|sponsorship|valid|holder|stamp)\b/.test(C.text);
  if (!(docVisa || /\b(green ?card|work permit|citizen\w*|permanent resid\w+|work authori[sz]ation|h-?1b|l-?1|o-?1)\b/.test(t))) return null;
  const v = ix.F.visa;
  const unit = ix.units.find(u => u.ref === 'profile:visa');
  const checked = { typed: 'visa' };
  const unknownPlace = C.terms.find(x => x.entity && x.unk);
  if (unknownPlace && !/h-?1b|l-?1|o-?1/.test(t)) return null;
  const sayB = /\bb-?1(?:\s*\/\s*|\s+and\s+|\s+or\s+|-)?b-?2\b/.test(t) || (C.w.some(x => x.low === 'b1') && C.w.some(x => x.low === 'b2'));
  const other = /(green ?card|h-?1b|l-?1|o-?1|\bopt\b|citizen|permanent resid|work permit|work authori[sz]ation|work visa|employment visa)/.test(t);
  if (other && !sayB) return { verdict: 'differs', explanation: `Not as stated: the record says ${v.text} It is a business-travel visa, not work authorisation or residency.`, units: [unit], checked };
  const purpose = /\bwork(?:ing)?\b|employ/.test(t) && sayB;
  if (purpose) return { verdict: 'differs', explanation: `Not as stated: the record says ${v.text} (business travel only).`, units: [unit], checked };
  const vd = C.dates;
  if (vd.length && v.valid_to) {
    const [y, m] = v.valid_to.split('-').map(Number);
    if (!vd.every(d => d.y === y && (d.m == null || d.m === m))) return { verdict: 'differs', explanation: `Not as stated: the record says ${v.text}`, units: [unit], checked };
  }
  if (!vd.length && C.nums.length) return null;
  return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: [unit], checked };
}

function yearsCheck(data, ix, C) {
  const yn = C.nums.filter(n => n.cls === 'year');
  if (!yn.length || C.nums.length > yn.length) return null;
  const ctx = new Set(C.w.map(x => x.stem));
  const exp = ['experienc', 'career', 'industry', 'professional', 'tech', 'b2b', 'saas', 'fintech', 'work', 'been', 'in'].some(s => ctx.has(s)) || C.w.some(x => ['experience', 'b2b', 'saas', 'fintech', 'career', 'industry', 'professional'].includes(x.low));
  if (!exp) return null;
  const known = new Set(['experienc', 'career', 'industry', 'professional', 'tech', 'b2b', 'saas', 'fintech', 'work', 'year', 'yr', 'in', 'of', 'been', 'more', 'than', 'over', 'least', 'plus', 'overall', 'total']);
  const others = C.terms.filter(t => !known.has(t.s) && !hasStem(C, t.s) === false && !['experienc', 'career', 'industry', 'professional', 'tech', 'b2b', 'saas', 'fintech', 'work', 'year'].includes(t.s));
  if (C.terms.some(t => t.unk)) return null;
  const F = ix.F, ex = F.experience;
  const unit = ix.units.find(u => u.ref === 'profile:experience');
  const checked = { typed: 'years' };
  if (C.terms.some(t => ['product', 'manag', 'pm', 'program', 'platform', 'payment', 'card', 'ai', 'data'].includes(t.s))) return { verdict: 'unclear', explanation: `The record gives ${ex.text} It does not state years in that narrower area; the roles with dates are listed under get_facts.`, units: [unit], checked };
  const fin = ctx.has('fintech');
  const floor = fin ? ex.fintech_years_min : ex.b2b_saas_years_min;
  const n = yn[0].value;
  const loose = C.w.some(x => ['over', 'than', 'least'].includes(x.low));
  if (n <= floor || (loose && n < (fin ? ex.fintech_years : ex.years))) return { verdict: 'supported', explanation: 'Supported: the record states this, quoted below.', units: [unit], checked };
  return { verdict: 'differs', explanation: `Not as stated: the record says ${ex.text}`, units: [unit], checked };
}

function stripDates(text) {
  return String(text).replace(new RegExp(`(?:\\b\\d{1,2}(?:st|nd|rd|th)?\\s+)?\\b${MONTH_RE}\\.?,?\\s+(?:\\d{1,2}(?:st|nd|rd|th)?,?\\s+)?(?:19|20)\\d{2}\\b`, 'gi'), ' ')
    .replace(/\b(?:19|20)\d{2}-\d{2}(?:-\d{2})?\b/g, ' ');
}


/* ================= fit for a job description ================= */
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

/* ---------- reading a job description: title, requirement lines, role family ---------- */
function guessTitle(text) {
  const src = String(text).trim();
  const label = src.match(/^\s*(?:job title|role|position|title)\s*[:-]\s*([^\n]{3,90})/im);
  if (label) return label[1].trim();
  const first = src.split(/\n|\.\s/)[0].trim();
  if (first && first.length <= 90 && /manager|lead|head|director|product|owner|\bpm\b/i.test(first) && !/\b(?:is|are)\s+(?:now\s+)?(?:hiring|seeking|looking)/i.test(first)) return first.replace(/^(job title|role|position)\s*[:-]\s*/i, '');
  const hire = src.match(/\b(?:is|are)\s+(?:now\s+)?(?:hiring|seeking|looking\s+for|recruiting)\s+(?:an?\s+|the\s+|our\s+)?([^.\n]{3,80}?)(?=\s+(?:to|who|for|that|with|in|at|on|and|you|which|based|located|join|reporting)\b|[.,;:\n]|$)/i)
    || src.match(/\b(?:we(?:'re| are)\s+(?:hiring|looking\s+for|seeking)|looking\s+for)\s+(?:an?\s+|the\s+)?([^.\n]{3,80}?)(?=\s+(?:to|who|for|that|with|in|at|on|and|you|which)\b|[.,;:\n]|$)/i);
  if (hire) return hire[1].trim().replace(/\s+/g, ' ');
  const m = src.match(/(?:(?:senior|staff|principal|lead|group|technical|founding|ai|platform)\s+){0,3}(?:product\s+(?:manager|lead|owner)|director of product|head of product|vp,? product)[^\n.;()]{0,40}/i);
  if (m) return m[0].trim();
  if (first && first.length <= 70 && first.split(/\s+/).length <= 9 && !/[.!?]$/.test(first)) return first;
  return null;
}

// [name, pattern, in_scope]. Order matters: the first pattern that matches the title wins.
const FAMILIES = [
  ['clinical', /\b(nurse|nursing|physician|doctor|surgeon|pharmacist|therapist|dentist|midwife|paramedic|radiograph\w*|clinician|caregiver)\b/i, false],
  ['legal', /\b(lawyer|attorney|solicitor|barrister|paralegal|legal counsel|general counsel|corporate counsel)\b/i, false],
  ['finance', /\b(accountant|auditor|actuar\w+|controller|financial analyst|investment (?:banker|analyst)|tax (?:advisor|consultant|manager)|treasury analyst|bookkeeper|underwriter|portfolio manager)\b/i, false],
  ['education', /\b(teacher|professor|lecturer|tutor|instructor|educator|school principal|headmaster)\b/i, false],
  ['data-science', /\b(data scientist|research scientist|applied scientist|machine learning (?:engineer|scientist)|ml (?:engineer|scientist)|nlp (?:engineer|scientist)|ai researcher|research engineer|statistician)\b/i, false],
  ['design', /\b(designer|ux researcher|ui\/ux|creative director|art director|illustrator|visual design\w*)\b/i, false],
  ['marketing', /\b(marketing|brand manager|copywriter|seo (?:specialist|manager)|content (?:writer|strategist)|social media|growth marketer|communications manager|public relations)\b/i, false],
  ['sales', /\b(account executive|sales (?:manager|representative|executive|director|development|lead)|business development (?:manager|representative|executive)|\bsdr\b|\bbdr\b|account manager|inside sales|sales rep)\b/i, false],
  ['client-technical', /\b(solutions?\s+(?:engineer|architect|consultant)|sales engineer|pre-?sales|customer engineer|technical account manager|implementation (?:manager|consultant|engineer|lead)|forward[- ]deployed|professional services|customer success (?:manager|engineer)|support engineer|field engineer|integration (?:engineer|manager))\b/i, true],
  ['operations', /\b(business analyst|operations? (?:manager|analyst|lead|associate)|product operations|chief of staff|strategy (?:and|&) operations|bizops|revops|systems analyst)\b/i, true],
  ['program', /\b(program(?:me)? (?:manager|lead|director)|project (?:manager|lead|coordinator)|delivery (?:manager|lead)|scrum master|release manager|technical program)\b/i, true],
  ['product', /\b(product (?:manager|owner|lead|director|management|head|analyst)|head of product|director of product|vp,? (?:of )?product|chief product|group product|\bpm\b|product)\b/i, true],
  ['engineering', /\b((?:software|backend|back-end|frontend|front-end|full[- ]?stack|mobile|ios|android|platform|site reliability|reliability|devops|infrastructure|security|cloud|qa|test|data|embedded|firmware|systems?|network|staff|senior|principal|civil|structural|mechanical|electrical|chemical|industrial)\s+(?:\w+\s+)?(?:engineer|developer|architect)|sre|devops|developer|programmer|engineer)\b/i, false],
];
const FAMILY_LABEL = { clinical: 'a clinical', legal: 'a legal', finance: 'a finance or accounting', education: 'a teaching', 'data-science': 'a data science or research', design: 'a design', marketing: 'a marketing', sales: 'a quota-carrying sales', engineering: 'a hands-on engineering', other: 'a non-product' };

function detectFamily(title, text) {
  const pick = s => {
    for (const [name, re, scope] of FAMILIES) {
      if (!re.test(s)) continue;
      if (name === 'client-technical' && /\bproduct (?:manager|owner|lead)\b/i.test(s)) continue; // "Forward Deployed Product Manager" is a product role
      return { name, in_scope: scope };
    }
    return null;
  };
  const t = pick(String(title || ''));
  if (t) return t;
  // no usable title: look at the opening of the text
  const head = pick(String(text).slice(0, 320));
  if (head) return head;
  const body = String(text);
  const signals = [['clinical', /\b(patients?|nursing|bedside|clinical care|icu|ward)\b/gi], ['legal', /\b(bar admission|litigation|counsel|contracts? law)\b/gi], ['education', /\b(classroom|students|curriculum|lesson)\b/gi], ['finance', /\b(statutory audit|bookkeeping|tax returns|ledger reconciliation)\b/gi]];
  for (const [name, re] of signals) if ((body.match(re) || []).length >= 3) return { name, in_scope: false };
  const prod = (body.match(/\b(roadmap|product strategy|prd|stakeholders|go-to-market|product manager|customer discovery)\b/gi) || []).length;
  return prod >= 2 ? { name: 'product', in_scope: true } : { name: 'other', in_scope: null };
}

const BOILER = /\b(equal opportunity|equal employment|we (?:offer|provide) |benefits|competitive (?:salary|compensation)|salary range|apply (?:now|today|here)|how to apply|about (?:us|the company|the role)|our (?:mission|values|culture)|who we are|join (?:us|our team)|perks|401k|health insurance|paid time off|reasonable accommodation)\b/i;
function splitRequirements(text, title) {
  const out = [];
  for (const raw of String(text).replace(/\r/g, '').split(/\n+/)) {
    const l = raw.replace(/^\s*(?:[-*•·▪◦‣–]|\d+[.)]|[a-z][.)])\s+/i, '').trim();
    if (!l) continue;
    if (/:\s*$/.test(l) && l.split(/\s+/).length <= 7) continue;
    for (let s of l.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)) {
      s = s.trim().replace(/[.;]+$/, '');
      const hire = s.match(/^.*?\b(?:is|are)\s+(?:now\s+)?(?:hiring|seeking|looking for|recruiting)\b[^,.]*?\s+(?:to|who|that|for)\s+(.+)$/i);
      if (hire) s = hire[1];
      if (!s || BOILER.test(s) || s.split(/\s+/).length < 2) continue;
      if (title && s.toLowerCase() === String(title).toLowerCase()) continue;
      out.push(s.slice(0, 280));
    }
  }
  return out.slice(0, 80);
}

/* ---------- hard requirements: explicit pass / fail checks ---------- */
const SOFT = /\b(preferred|nice to have|a plus|bonus|ideally|desirable|advantage|beneficial|or equivalent)\b/i;
const GENERIC_DOMAIN = /^(?:experience|relevant|related|professional|work|industry|the industry|software|technology|tech|saas|b2b|b2b saas|enterprise|enterprise software|fintech|payments?|banking|financial services?|product|product management|product manager|pm|program management|project management|technical|platform|data|ai|apis?|card issuing|cards?|infrastructure|banking infrastructure|payments? infrastructure|data platforms?|digital|startups?|consumer|b2c|growth|delivery|leadership|managing|delivering|building|owning|shipping|launching)\b/i;
function domainKnown(domain, ix) {
  const ws = wordsOf(domain).filter(x => !FRAME.has(x.stem) && !COMMON.has(x.stem) && !/^(experienc|relevant|relat|professional|building|managing|leading|deliver|shipping|launching|owning|hands|proven|progressive|full|time|strong|solid|deep|demonstrated|track|record|working|engineering|environments?)$/.test(x.stem));
  return ws.length === 0 || ws.every(x => ix.vocab.has(x.stem) || /^(product|manag|platform|data|fintech|bank|payment|card|saas|b2b|api|ai|program|project|deliver|technical)/.test(x.stem));
}
function hardChecks(line, data, ix, comps) {
  const F = ix.F, ex = F.experience;
  const soft = SOFT.test(line);
  const out = [];
  // years of experience
  for (const m of line.matchAll(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:or more\s+)?(?:years?|yrs?)\b(?:['’]?\s*of)?\s*((?:(?:relevant|professional|hands-on|proven|progressive|full[- ]time|work|industry|related|prior|direct)\s+)*)(?:experience)?\s*(?:(?:in|with|as|of|on|managing|leading|building|within|at)\s+)?([^.,;:()\n]{0,70})/gi)) {
    const need = parseInt(m[1], 10);
    const domain = (m[4] || '').trim();
    if (need < 1 || need > 40) continue;
    const known = !domain || GENERIC_DOMAIN.test(domain) || domainKnown(domain, ix);
    // which tenure is compared: fintech roles for a fintech / payments / cards / banking ask, else his whole career
    const fin = ex.fintech_months != null && /fintech|payments?|\bcards?\b|card issuing|bank(?:s|ing)?\b|financial/i.test(domain);
    const months = fin ? ex.fintech_months : ex.months, since = fin ? ex.fintech_since : ex.since, hv = months / 12;
    const compared = fin ? 'fintech' : 'total';
    const status = known ? (need * 12 <= months ? 'pass' : 'fail') : 'fail';
    let cap = null;
    if (status === 'fail') cap = !known ? 59 : need >= hv + 4 ? 49 : need >= hv + 1.5 ? 62 : null;
    const basis = fin ? `his fintech tenure (Zeta and Backbase, ${fmtYM(since)} to ${fmtYM(data.updated.slice(0, 7))})` : `his total tenure (${fmtYM(since)} to ${fmtYM(data.updated.slice(0, 7))}: HackerEarth, Zeta, Backbase)`;
    out.push({
      type: 'years', requirement: m[0].trim().replace(/\s+/g, ' '), need: `${need}+ years${domain ? ` ${/^(in|of|with|as)\b/i.test(domain) ? '' : 'in '}${domain}` : ''}`.trim(),
      have: known ? `${fmtTenure(months)} ${fin ? 'in fintech' : 'in total'} (since ${fmtYM(since)})` : 'no recorded years in that field',
      compared: known ? compared : null, have_months: known ? months : null,
      status, soft, cap: soft ? null : cap, near: status === 'fail' && known && need * 12 - months <= 12,
      detail: !known ? `The record shows no ${need}+ years in "${domain}".` : status === 'pass' ? `Compared with ${basis}: ${fmtTenure(months)}, which meets ${need}+.` : `Compared with ${basis}: ${fmtTenure(months)}, which is short of ${need}+.`,
    });
  }
  // degrees
  if (/\b(bachelor'?s?|b\.?\s?tech|b\.?\s?e|b\.?\s?sc|undergraduate|master'?s?|m\.?\s?tech|m\.?\s?sc|mba|ph\.?\s?d|doctorate|doctoral|llb|degree|diploma)\b/i.test(line)) {
    const lvl = /\bph\.?\s?d\b|doctor/i.test(line) ? 'phd' : /\bmaster'?s?\b|\bm\.?\s?tech\b|\bm\.?\s?sc\b|\bmba\b/i.test(line) ? 'masters' : /\bllb\b|\bj\.?d\b|law degree/i.test(line) ? 'law' : 'bachelors';
    const field = (line.match(/\b(?:degree|bachelor'?s?|master'?s?|diploma)(?:\s+degree)?\s+(?:in|of)\s+([^.;:()]{3,80})/i) || line.match(/\b(?:in|of)\s+([a-z ,/&-]{3,60}?)\s+(?:degree|or equivalent)/i) || [])[1] || '';
    const fieldOk = !field || /engineer|technical|computer|related|relevant|stem|quantitative|business|any|equivalent|information|software|science|electrical|electronics/i.test(field);
    const eq = /equivalent/i.test(line);
    let status, detail, cap = null;
    if (lvl === 'bachelors') { status = fieldOk ? 'pass' : 'fail'; detail = fieldOk ? `He has a ${F.education.degree} in ${F.education.field}.` : `He has a ${F.education.degree} in ${F.education.field}, not ${field.trim()}.`; }
    else { status = 'fail'; detail = `The record shows a ${F.education.degree} only; ${lvl === 'phd' ? 'no PhD' : lvl === 'law' ? 'no law degree' : "no master's or MBA"}.`; cap = lvl === 'phd' ? 45 : 60; }
    out.push({ type: 'degree', requirement: line.slice(0, 160), need: lvl === 'bachelors' ? `bachelor's${field ? ` in ${field.trim()}` : ''}` : lvl === 'phd' ? 'PhD' : lvl === 'law' ? 'law degree (LLB/JD)' : "master's or MBA", have: `${F.education.degree}, ${F.education.field}, ${F.education.school}`, status, soft: soft || eq, cap: soft || eq ? null : cap, detail });
  }
  // licences and certifications
  const lic = line.match(/\b(?:active|valid|current|state|professional)?\s*(?:([A-Za-z][\w&./-]*(?:\s+[A-Za-z][\w&./-]*){0,3})\s+)?(licen[cs]e[sd]?|licensure|certification|certificate|certified|admission|qualification)\b/i);
  const named = line.match(/\b(registered nurse|RN|bar admission|admitted to the bar|chartered accountant|CPA|CFA|PMP|CBAP|ACLS|BLS|CISSP|CSM|PRINCE2|ITIL|SAFe|CA)\b/);
  if (lic || named) {
    const nm = (named ? named[0] : lic[1] || lic[0]).trim();
    const licence = /licen[cs]|licensure|registered nurse|\bRN\b|bar admission|admitted to the bar|chartered|\bCPA\b|\bCA\b|\bACLS\b|\bBLS\b|qualification/i.test(line);
    const record = F.certifications.map(c => `${c.name} (${c.org})`).join('; ');
    const ws = wordsOf(line.replace(/certif\w*|licen[cs]\w*|required|preferred|valid|active|professional|relevant|current|a plus|nice to have/gi, ' ')).filter(x => !FRAME.has(x.stem) && !COMMON.has(x.stem) && x.low.length > 2);
    const have2 = ws.some(x => F.certifications.some(c => wordsOf(`${c.name} ${c.org}`).some(y => y.stem === x.stem)));
    const hit = lic || named;
    if (hit && (named || /licen[cs]|certif|qualification|admission/i.test(line))) out.push({ type: licence ? 'licence' : 'certification', requirement: line.slice(0, 160), need: nm || 'certification', have: record ? `certifications on record: ${record}` : 'none on record', status: have2 ? 'pass' : 'fail', soft, cap: licence && !soft && !have2 ? 40 : null, detail: have2 ? 'A matching certification is on the record.' : `No such ${licence ? 'licence or qualification' : 'certification'} on the record. His certifications: ${record}.` });
  }
  // managing product managers (a recorded gap)
  const pm = detect(line, comps).find(f => f.c.id === 'people-management') || (GAP_EXTRA.test(line) ? { c: comps.find(c => c.id === 'people-management') } : null);
  if (pm && pm.c) out.push({ type: 'people-management', requirement: line.slice(0, 160), need: 'managing product managers', have: 'led 8 engineers and 3 CSMs; no PM direct reports on record', status: 'fail', soft, cap: soft ? null : 49, detail: pm.c.note });
  // languages
  const lang = line.match(/\b(?:fluen\w+|proficien\w+|native|working knowledge of|business-level)\s+(?:in\s+)?(German|French|Spanish|Mandarin|Chinese|Japanese|Korean|Arabic|Portuguese|Italian|Dutch|Russian|Hindi|Tamil|Telugu)\b|\b(German|French|Spanish|Mandarin|Japanese|Korean|Arabic|Portuguese|Italian|Dutch|Russian)\s+(?:language\s+)?(?:fluency|proficiency)\b/i);
  if (lang) out.push({ type: 'language', requirement: line.slice(0, 160), need: lang[1] || lang[2], have: 'languages are not stated on the record', status: 'unknown', soft, cap: null, detail: 'The record does not list languages.' });
  // location and work authorisation
  if (/\b(authori[sz]ed to work|work authori[sz]ation|right to work|eligib\w+ to work|(?:no|not|cannot|unable to)\s+(?:\w+\s+)?sponsor\w*|visa sponsorship|security clearance|must be (?:a |an )?(?:us|u\.s\.|uk|eu)\s*(?:citizen|resident))\b/i.test(line)) {
    const india = /\bindia\b/i.test(line);
    out.push({ type: 'work-authorisation', requirement: line.slice(0, 160), need: 'work authorisation as stated', have: F.visa.text, status: india ? 'pass' : 'fail', soft, cap: india || soft ? null : 62, detail: india ? 'Based in India.' : 'He is based in India; the record shows only a US B1/B2 business-travel visa and no work authorisation elsewhere.' });
  }
  if (/\b(on-?site|onsite|hybrid|in[- ]office|must (?:be )?(?:based|located|reside)|relocat\w+|work from)\b/i.test(line) && !/\bremote\b/i.test(line)) {
    const near = /\b(hyderabad|india)\b/i.test(line);
    out.push({ type: 'location', requirement: line.slice(0, 160), need: 'on-site or relocation as stated', have: `${F.location.text}; open to relocation`, status: near ? 'pass' : 'partial', soft, cap: null, detail: near ? 'Based in Hyderabad, India.' : 'He is in Hyderabad, India and open to relocation.' });
  }
  return out;
}

/* ---------- the fit ---------- */
export function fitFor(data, jobText, { persona, title: titleOpt, requirements } = {}) {
  const ix = index(data);
  const { comps } = ix;
  if (persona && PERSONAS[persona]) return build(data, detect(PERSONAS[persona].text, comps), { title: PERSONAS[persona].label, text: PERSONAS[persona].text, persona });
  const mine = Array.isArray(requirements) ? requirements.map(r => String(r || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 80).map(r => r.slice(0, 400)) : null;
  const text = mine ? mine.join('\n') : String(jobText || '');
  const title = titleOpt ? String(titleOpt).trim().slice(0, 120) : guessTitle(mine ? `${mine[0]}` : text) || null;
  const lines = mine || splitRequirements(text, title);
  const familyText = mine ? `${titleOpt || ''}\n${text}` : text;
  const family = detectFamily(titleOpt || (mine ? null : title), familyText);
  const rows = lines.map(l => ({ text: l, found: detect(l, comps), hard: hardChecks(l, data, ix, comps) }));
  const whole = mine ? text + (titleOpt ? '\n' + titleOpt : '') : text;
  return build(data, detect(whole, comps), { title, text, persona: null, req: { rows, family } });
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

// An AI caller's own list of requirements: one row each, with evidence quotes or "no evidence on record".
export function checkRequirements(data, requirements, { title } = {}) {
  return fitFor(data, '', { requirements, title });
}


// things the row names that his record never mentions: acronyms and product names (HIPAA, PyTorch, Swift, Salesforce)
const NAMED_SKIP = new Set(["bachelor", "master", "degree", "diploma", "mba", "phd", "doctorate", "excellent", "strong", "advanced", "proven",
  // seniority and region words describe the role, not a tool or product his record could be missing
  "senior", "junior", "staff", "principal", "lead", "head", "chief", "associate", "group", "director", "manager", "europe", "european", "asia", "apac", "latam", "africa", "america", "americas", "north", "south", "east", "west", "global", "worldwide", "remote", "hybrid"]);
function namedMissing(ix, data, line) {
  const C = analyseClaim(ix, line, data);
  const caps = C.w.filter(x => x.cap);
  return C.terms.filter(t => t.unk === 'hard' && t.i > 0 && !NAMED_SKIP.has(t.low)).filter(t => {
    const k = C.w.findIndex(x => x.i === t.i);
    const run = [k - 1, k + 1].map(j => C.w[j]).filter(x => x && x.cap && x.low.length > 2);
    return !run.some(x => ix.vocab.has(x.stem));   // "Model Context Protocol": a known word beside it means a name we only half know
  }).map(t => t.raw);
}

/* ---------- confidence: how strongly does his record evidence this requirement? ----------
   Each line of evidence is weighed on five things you can see in the line itself:
     relevance    it uses your words (1.0) or is linked to the skill by his record only (0.7)
     ownership    he owned or led it: the line opens with owned, led, built, shipped... (1.0) or not (0.85)
     specificity  it carries a number (1.0) or doesn't (0.85)
     recency      within a year (1.0), within three (0.9), older (0.75)
     setting      day job (1.0) or side project (0.85)
   Lines from the same place (one product or program, or one side project) count once: the strongest. A role that
   ran two products counts as two places.
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
    const at = r.lineAt?.get(quote) || r;
    return { ...brief(r), org: r.org, period: r.period, place: at.place, where: at.where, quote, matched: words, months, factors, e };
  });
  const places = new Map();
  for (const it of items) if (!places.has(it.place) || places.get(it.place).e < it.e) places.set(it.place, it);
  const parts = [...places.values()].sort((x, y) => y.e - x.e).map(it => ({ place: it.place, title: it.title, value: it.e }));
  const raw = parts.length ? 1 - parts.reduce((acc, x) => acc * (1 - K * x.value), 1) : 0;
  const cap = CAP[f.c.strength];
  const confidence = r2(Math.min(raw, cap ?? 1, CEILING));
  return { items, parts, raw: r2(raw), cap: cap != null && raw > cap ? cap : null, confidence };
}

const placeName = it => it.where.replace(/\s*-\s*present/i, ' to now').replace(/(\w{3} \d{4}|\d{4})\s+-\s+/, '$1 to ');
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
  if (a.parts.length === 1 && a.cap == null) out.push('One place only, so it stops short of "Strong", which needs a second product or project.');
  if (a.cap != null) out.push(`Capped at ${a.cap} by his own assessment ("${STRENGTH_LABEL[f.c.strength]}"): self-assessment can lower a score, never raise it.${f.c.note ? ` ${f.c.note}` : ''}`);
  return out;
}
const mathOf = a => {
  if (!a.parts.length) return 'no evidence = 0';
  const raw = a.raw >= 0.995 ? '0.99+' : a.raw.toFixed(2);
  const tail = a.cap != null ? `, capped at ${a.cap} by his own assessment` : a.raw > CEILING ? `, held at ${CEILING} (nothing is certain)` : '';
  return `1 - ${a.parts.map(x => `(1 - 0.75 × ${x.value.toFixed(2)})`).join(' × ')} = ${raw}${tail}`;
};


function build(data, found, { title, text, persona, req }) {
  const ix = index(data);
  const { records, comps } = ix;
  const F = ix.F;
  const reqRows = req ? req.rows : [];
  const hardAll = [];
  reqRows.forEach((r, i) => r.hard.forEach(h => hardAll.push({ ...h, line: i })));
  const seenH = new Set();
  const hard = hardAll.filter(h => { const k = `${h.type}|${h.need}|${h.requirement}`; if (seenH.has(k)) return false; seenH.add(k); return true; })
    .map(({ line, ...h }) => ({ ...h, row: line }));
  const fam = req?.family || null;
  const outOfScope = !!fam && fam.in_scope === false;
  const family = !req ? { name: 'n/a', in_scope: true, message: '' } : outOfScope
    ? { name: fam.name, in_scope: false, message: `This reads as ${FAMILY_LABEL[fam.name] || 'a non-product'} role, not a product, program or client-facing technical role. His record is product, platform and delivery work in fintech and enterprise software, so the score is capped at 35 and the requirements below show what is not on record.` }
    : fam.name === 'other' ? { name: 'unknown', in_scope: true, message: 'The role family could not be told from the text, so it is scored on the requirements alone.' }
    : { name: fam.name, in_scope: true, message: `Reads as a ${fam.name.replace('-', ' ')} role, within his product, program and client-facing platform work.` };

  const unmappedRows = reqRows.filter(r => !r.found.length && !r.hard.length);
  const namedRows = reqRows.map(r => namedMissing(ix, data, r.text));
  if (!found.length && !outOfScope && !hard.some(h => h.status === 'fail')) {
    const unmapped = unmappedRows.map(r => ({ text: r.text, note: 'No evidence on record.' }));
    return { title, score: null, band: 'Not enough to go on', credit: null, matches: [], gaps: [], also: [], read_first: [], notes: [], questions: [], summary: [],
      requirements: reqRows.map((r, i) => ({ text: r.text, status: r.hard.length && !r.found.length ? 'hard' : 'unmapped', confidence: null, evidence: [] })), unmapped, hard, family,
      message: 'No recognisable requirements found. Paste the full job description (responsibilities and requirements).' };
  }
  const quoted = new Set();
  const rows = found.map(f => ({ f, a: assess(data, f, records, quoted) }))
    .sort((x, y) => y.f.w * y.a.confidence - x.f.w * x.a.confidence);
  const U = 0.6;   // an unmapped line, or a line that names things his record never mentions, counts as this much zero-evidence weight
  const failW = h => (h.status === 'fail' && h.type !== 'people-management' ? (h.soft || h.near ? 0.4 : 1) : 0);
  const namedLines = reqRows.filter((r, i) => r.found.length && namedRows[i].length);
  const namedCount = namedLines.length;
  const failedHard = hard.filter(h => failW(h) > 0);
  const num = rows.reduce((s, x) => s + x.f.w * x.a.confidence, 0);
  const wsum = found.reduce((s, f) => s + f.w, 0);
  const extra = U * (unmappedRows.length + namedCount) + failedHard.reduce((s, h) => s + failW(h), 0);
  const den = wsum + extra;
  // a must-have asked for more than once with (almost) no evidence caps the whole fit: an average shouldn't hide it
  const hardGaps = rows.filter(x => x.f.w >= 1.5 && x.a.confidence <= 0.15).map(x => x.f.c.label);
  const HARD_CAP = 44;
  const mean = wsum ? Math.round(100 * num / wsum) : 0;
  let score = den ? Math.round(100 * num / den) : 0;
  const beforeCaps = score;
  const caps = [];
  if (hardGaps.length) caps.push([HARD_CAP, `Hard gap: ${hardGaps.join(', ')} is asked for repeatedly and nothing in his record evidences it, so the fit is capped at ${HARD_CAP}.`]);
  for (const h of hard) if (h.cap && !h.soft && h.status === 'fail') caps.push([h.cap, `Hard requirement not met (${h.type}): ${h.detail} The fit is capped at ${h.cap}.`]);
  // the requirement the role is built around (in its title, or in a large share of its lines) is only adjacent for him
  if (req && !persona) {
    const inTitle = new Set((title ? detect(title, comps) : []).map(t => t.c.id));
    for (const x of rows) {
      const share = reqRows.filter(r => r.found.some(f => f.c.id === x.f.c.id)).length / Math.max(reqRows.length, 1);
      if (['adjacent', 'gap'].includes(x.f.c.strength) && x.f.c.id !== 'people-management' && x.a.confidence <= 0.45 && (inTitle.has(x.f.c.id) || share >= 0.35)) {
        caps.push([54, `Central requirement is only adjacent for him: ${x.f.c.label}${inTitle.has(x.f.c.id) ? ' (named in the title)' : ` (in ${Math.round(share * 100)}% of the requirement lines)`}. ${x.f.c.note || ''} The fit is capped at 54.`.replace(/\s+/g, ' ').trim()]);
        break;
      }
    }
  }
  if (outOfScope) caps.push([35, family.message]);
  const lowest = caps.reduce((m, c) => (c[0] < m ? c[0] : m), 101);
  if (lowest <= 100) score = Math.min(score, lowest);
  const band = FIT_BANDS.find(([min]) => score >= min)[1];
  const scoreMath = {
    weighted_mean: mean, weight: r2(wsum), numerator: r2(num),
    zero_rows: { unmapped: unmappedRows.length, named_terms: namedCount, each: U, hard_fail_weight: r2(failedHard.reduce((s, h) => s + failW(h), 0)) },
    denominator: r2(den), before_caps: beforeCaps, caps: caps.map(([value, why]) => ({ value, why })), applied_cap: lowest <= 100 ? lowest : null, final: score,
  };

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

  // one row per requirement line: mapped to a competency with its confidence, or unmapped (no evidence on record)
  const byId = new Map(rows.map(x => [x.f.c.id, x]));
  const requirements = reqRows.map((r, i) => {
    const mine = r.found.map(f => byId.get(f.c.id)).filter(Boolean).sort((x, y) => y.a.confidence - x.a.confidence);
    const checks = hard.map((h, k) => [h, k]).filter(([h]) => h.row === i).map(([, k]) => k);
    const missing = namedRows[i];
    if (!mine.length) return { text: r.text, status: checks.length ? 'hard' : 'unmapped', confidence: checks.length && checks.every(k => hard[k].status === 'pass') ? 0.9 : null, confidence_band: null, competencies: [], evidence: [], hard: checks, note: checks.length ? undefined : 'No evidence on record.' };
    const top = mine[0];
    return {
      text: r.text, status: 'mapped', confidence: top.a.confidence, confidence_band: bandOf(top.a.confidence),
      competencies: mine.map(x => ({ id: x.f.c.id, label: x.f.c.label, confidence: x.a.confidence, confidence_band: bandOf(x.a.confidence) })),
      evidence: top.a.items.slice(0, 2).map(({ ref, kind, id, title, url, quote }) => ({ ref, kind, id, title, url, quote })), hard: checks,
      ...(missing.length ? { not_on_record: missing } : {}),
      ...(top.a.confidence <= 0.45 && mine.every(x => ['adjacent', 'gap'].includes(x.f.c.strength)) ? { thin: true } : {}),
    };
  });
  const unmapped = requirements.filter(r => r.status === 'unmapped' || r.not_on_record || r.thin).map(r => (
    r.status === 'unmapped' ? { text: r.text, reason: 'none', note: r.note }
    : r.not_on_record ? { text: r.text, reason: 'named-terms', missing: r.not_on_record, note: `Mapped to ${r.competencies[0].label} by general words, but it names ${r.not_on_record.join(', ')}, which his record never mentions.` }
    : { text: r.text, reason: 'adjacent', note: `Only adjacent evidence on record (${r.competencies[0].label}, confidence ${r.confidence}).` }));
  const evidenced = req
    ? requirements.filter(r => ((r.status === 'mapped' && !r.not_on_record) || r.status === 'hard') && r.confidence >= 0.65).length
    : rows.filter(x => x.a.confidence >= 0.65).length;
  const coverage = { evidenced, total: req ? requirements.length : rows.length };

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
  if (outOfScope) notes.push(family.message);
  for (const c of caps) if (!outOfScope || c[1] !== family.message) notes.push(c[1]);
  const yr = hard.find(h => h.type === 'years' && h.status !== 'unknown' && h.compared);
  if (yr && !persona) {
    const need = parseInt(yr.need, 10), ex = F.experience, fin = yr.compared === 'fintech';
    notes.push(`Experience: the role asks for ${yr.need}. I compared it with his ${fin ? `fintech tenure, ${fmtTenure(ex.fintech_months)} (Zeta and Backbase, since ${fmtYM(ex.fintech_since)})` : `total tenure, ${fmtTenure(ex.months)} (since ${fmtYM(ex.since)})`}, which ${yr.status === 'pass' ? 'meets' : 'falls short of'} ${need}+. His profile says "${ex.text.split(',').slice(0, 2).join(',')}".`);
  }
  // the one sentence that lets a reader reproduce the number when it sits below the plain weighted average
  if (!persona && wsum && extra > 0) {
    const bits = [];
    if (namedCount) bits.push(`${namedCount} requirement line${namedCount > 1 ? 's' : ''} naming things his record never mentions (${[...new Set(namedLines.flatMap(r => namedRows[reqRows.indexOf(r)]))].slice(0, 4).join(', ')})`);
    if (unmappedRows.length) bits.push(`${unmappedRows.length} unmapped line${unmappedRows.length > 1 ? 's' : ''}`);
    if (failedHard.length) bits.push(`${failedHard.length} failed hard check${failedHard.length > 1 ? 's' : ''} (${failedHard.map(h => h.type).join(', ')})`);
    notes.push(`Score arithmetic: the weighted average of the evidenced requirements is ${mean}, but ${bits.join(' and ')} are counted as zero evidence, adding weight (${U} per such line, ${failedHard.some(h => h.soft || h.near) ? '0.4 per preferred check or years shortfall under a year, ' : ''}1 per other failed hard check), so the weights grow from ${r2(wsum)} to ${r2(den)} and the score is ${beforeCaps}${scoreMath.applied_cap != null && beforeCaps > scoreMath.applied_cap ? `, then capped at ${scoreMath.applied_cap}` : ''}.`);
  }
  for (const h of hard) if (h.status === 'fail' && !h.cap && h.type !== 'years' && h.type !== 'people-management' && !h.soft) notes.push(`Not on record (${h.type}): ${h.need}. ${h.detail}`);
  if (/\b(director|head of|vp|vice president|group product manager)\b/i.test(text) && !persona) notes.push('Level: this reads as a people-leadership role; see the "Managing PMs" gap.');
  if (/\b(remote)\b/i.test(text)) notes.push('Location: based in Hyderabad, India; open to relocation.');
  const none = unmapped.filter(u => u.reason !== 'adjacent');
  if (none.length) notes.push(`${none.length} requirement${none.length > 1 ? 's have' : ' has'} no evidence on his record (or ${none.length > 1 ? 'name' : 'names'} something it never mentions) and ${none.length > 1 ? 'count' : 'counts'} as zero in the score.`);

  const questions = [];
  for (const g of gaps.slice(0, 2)) questions.push(`${g.label}: ask how he'd close this gap in his first 90 days.${g.note ? ` On record: ${g.note}` : ''}`);
  for (const u of unmapped.slice(0, 1)) questions.push(`Nothing on record for "${u.text.slice(0, 90)}": ask him directly.`);
  for (const m of matches.slice(0, 3)) {
    const e = m.evidence[0];
    if (e) questions.push(`${m.label}: ask him to walk through "${e.title}" - ${e.quote.replace(/\.$/, '')}.`);
  }

  const summary = matches.slice(0, 3).map(m => `${m.label}: ${m.evidence[0]?.quote || m.note || ''}`);
  const detected = found.map(f => ({ id: f.c.id, w: f.w }));
  return {
    title, score, band, credit: Math.round(300 + (score / 100) * 550), coverage,
    method: 'Each requirement: every line of evidence is weighed on relevance (your words 1.0, linked 0.7) × ownership (owned or led 1.0, else 0.85) × specificity (a number 1.0, else 0.85) × recency (1 year 1.0, 3 years 0.9, older 0.75) × setting (day job 1.0, side project 0.85). Lines from the same product or project count once. Places combine as confidence = 1 - Π(1 - 0.75 × place), so one strong place reaches 0.75 and 0.85+ needs two. His self-assessment can only cap it. Fit = the average of confidence across your requirements, weighted by how often you ask for each, × 100 (see below for what lowers it); a must-have with no evidence caps it at 44. Every requirement line gets a row: a line no competency covers is "unmapped" (nothing on record), and a line that names things his record never mentions, adds 0.6 of zero-evidence weight each (a failed hard check adds 1) to the weights you divide by, so the score is sum(weight × confidence) ÷ (sum of weights + that extra weight) × 100 and a description that is mostly unmapped scores low; any cap then takes the minimum. The score_math field lists every number. Hard requirements (years, degrees, licences, managing PMs, work authorisation) are explicit pass/fail checks and cap the score when missed; a role outside product, program and client-facing technical work is capped at 35. Everything is from his own record: much of it is internal to employers, so nothing is checked against the web.',
    matches, gaps, also, read_first, notes, questions, summary, detected,
    requirements, unmapped, hard, family, score_math: scoreMath,
  };
}

/* ---------- a plain-text resume (served as an MCP resource) ---------- */
export function resumeMarkdown(data) {
  const p = data.profile;
  const lines = [`# ${p.name}`, `${p.headline} · ${p.location}`, '', p.summary, '', `Now: ${p.current.title}, ${p.current.company} (${p.current.since}). ${p.current.focus}`, '', '## Case studies'];
  for (const c of data.cases) lines.push('', `### ${c.title} (${c.org}, ${c.period})`, `${c.metric.value} ${c.metric.label}`, ...c.evidence.map(e => `- ${e}`));
  lines.push('', '## Experience');
  for (const r of data.roles) {
    lines.push('', `### ${r.title}, ${r.company} (${r.period}, ${r.location})`, r.scope);
    for (const x of r.products || []) lines.push(`- ${x.as}: ${x.name}${x.case ? ` (case study above: ${data.cases.find(c => c.id === x.case)?.title})` : ''}`);
    lines.push(...r.evidence.map(e => `- ${e}`));
  }
  lines.push('', '## Side projects');
  for (const pr of data.projects) lines.push(`- ${pr.name} (${pr.url}): ${pr.tagline}`);
  if (data.skills) {
    lines.push('', '## Skills');
    for (const [group, rows] of Object.entries(data.skills)) lines.push(`- **${group}**: ${Object.entries(rows).map(([k, v]) => `${k}: ${v}`).join('; ')}`);
  }
  lines.push('', '## Education', p.education);
  lines.push('', '## Recognition', ...data.awards.map(a => `- ${a.name}, ${a.org}, ${a.date}: ${a.for}`));
  lines.push('', `Contact: ${p.contact.email} · ${p.contact.linkedin} · ${p.links.portfolio}`);
  return lines.join('\n');
}

// exposed for tests and debugging only
export const _internals = { index, analyseClaim, evalUnit };
