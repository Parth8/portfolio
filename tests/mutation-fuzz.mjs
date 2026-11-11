// Mutation fuzz for prove_claim: every claim the record supports is mutated into something false, deterministically
// (seeded), and no mutant may come back "supported". Mutants change one decisive part: an employer / bank / network /
// tool the record never mentions (replaced or inserted), a job title not on the record, a number (digits or words), a
// year or a month. Nothing here lists the strings under test, so it cannot be memorised.
import { readFileSync } from 'node:fs';
import * as E from '../js/career-engine.js';

const here = p => new URL(p, import.meta.url);
const data = JSON.parse(readFileSync(here('../data/career.json'), 'utf8'));
const jsonl = f => readFileSync(here(`./golden/${f}`), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

export const FOREIGN = ['Google', 'Amazon', 'Wells Fargo', 'Amex', 'Snowflake', 'Terraform', 'Stripe', 'Apple', 'Meta', 'Netflix', 'Oracle', 'Salesforce', 'SAP', 'IBM', 'Infosys', 'Wipro', 'TCS', 'Deloitte', 'McKinsey', 'Goldman Sachs', 'JPMorgan', 'Citibank', 'Barclays', 'HSBC', 'Revolut', 'Square', 'PayPal', 'Adyen', 'Plaid', 'Klarna', 'Discover', 'Rupay', 'Databricks', 'Kubernetes', 'Docker', 'Jenkins', 'Redis', 'Postgres', 'Elasticsearch', 'Tableau', 'Looker', 'Splunk', 'Datadog', 'Twilio', 'Shopify', 'Uber', 'Airbnb', 'Spotify', 'Tesla', 'Nvidia', 'Intel', 'Cisco', 'Adobe', 'Atlassian Corp', 'Slack', 'Zoom', 'Flipkart', 'Swiggy', 'Paytm', 'Razorpay', 'PhonePe', 'Capital One', 'Chase', 'Morgan Stanley', 'Fidelity', 'Visa Europe', 'UnionPay', 'Ansible', 'Rust', 'Scala', 'Hadoop', 'Cassandra'];
export const TITLES = ['CEO', 'CTO', 'CFO', 'COO', 'Software Engineer', 'Designer', 'Data Scientist', 'Account Executive', 'Sales Manager', 'Marketing Manager', 'Recruiter', 'Accountant', 'Nurse', 'Chief Product Officer', 'VP of Engineering', 'Solutions Architect', 'DevOps Engineer', 'Business Analyst', 'Head of Growth', 'Operations Director'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr, n) => { const a = [...arr], out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; };

const recordText = JSON.stringify(data).toLowerCase();
const foreign = FOREIGN.filter(n => !new RegExp(`(^|[^a-z0-9])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(recordText));
// titles he has never held (a team called "CEO Office" does not make "CEO" a title of his)
const held = [...data.roles.flatMap(r => [r.title, ...(r.products || []).map(p => p.as)]), data.profile.headline, data.profile.current.title].map(t => t.toLowerCase());
const titles = TITLES.filter(t => !held.some(h => h.includes(t.toLowerCase())));
// employers: a name that is a client or partner in the record (Google, Microsoft) is still not an employer of his
const employerNames = new Set(data.roles.map(r => r.company.toLowerCase()));
const notEmployers = FOREIGN.filter(n => !employerNames.has(n.toLowerCase()));

// every number and year the record contains, so a mutant never lands on a true value
const ix = E._internals.index(data);
const recNums = new Set(), recYears = new Set(), recMonthYear = new Set();
for (const u of ix.units) {
  for (const n of u.nums) recNums.add(n.value);
  for (const d of u.dates) { recYears.add(d.y); if (d.m) recMonthYear.add(`${d.y}-${d.m}`); }
}
for (const m of recordText.matchAll(/\d[\d,]*(?:\.\d+)?/g)) recNums.add(parseFloat(m[0].replace(/,/g, '')));
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20 };
const WORD_OF = Object.fromEntries(Object.entries(WORDS).map(([w, v]) => [v, w]));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const NOUNLESS = new Set('and the for with from over per but that who are was has had its his our their not out off all any new one two a an to of in on at by as or'.split(' '));
const lines = ix.units.map(u => u.line.toLowerCase().replace(/(\d),(\d{3})/g, '$1$2'));
const statedWith = (c, unit) => lines.some(l => new RegExp(`(?<![\\d.])~?${String(c).replace('.', '\\.')}[kmb%+x]?[\\s-]*${unit.slice(0, 4)}`).test(l));
const SKIP_CAP = new Set('He His Parth The A An At In It Its She Her They Their This That Zero Part Bank Optum UnitedHealthcare'.split(' '));

const entityTokens = claim => {
  const out = [];
  for (const m of claim.matchAll(/\b[A-Z][A-Za-z0-9&]*(?:'s)?\b/g)) {
    const w = m[0].replace(/'s$/, '');
    if (SKIP_CAP.has(w) || MONTHS.includes(w) || /^\d/.test(w)) continue;
    if (E._internals.index(data).names.has(w.toLowerCase()) || true) out.push({ w, at: m.index, len: m[0].length });
  }
  return out;
};

export function mutants(claim, r) {
  const out = [];
  const add = (kind, text) => { if (text !== claim) out.push({ kind, claim: text }); };
  const base = claim.replace(/[.]$/, '');
  // (a) a name the record never mentions: replaced for each named thing, and inserted
  const ents = entityTokens(claim);
  for (const t of ents) for (const f of pick(r, foreign, 3)) add('entity-replace', claim.slice(0, t.at) + f + (claim.slice(t.at + t.len).startsWith("'s") ? '' : '') + claim.slice(t.at + t.len));
  for (const f of pick(r, foreign, 4)) {
    add('entity-insert', `${base} at ${f}.`);
    add('entity-insert', `${base} with ${f}.`);
    add('entity-insert', `${base} using ${f}.`);
    add('entity-insert', `${base}, and he did it for ${f}.`);
  }
  // (b) a title not on the record, replacing a known title
  const KNOWN = ['Forward Deployed Product Manager', 'Technical Program Manager', 'Technical Product Manager', 'Project Manager', 'Product Manager', 'Product Owner'];
  for (const k of KNOWN) if (claim.includes(k)) for (const t of pick(r, titles, 4)) add('title-replace', claim.replace(k, /^[AEIOU]/.test(t) ? t : t));
  // (c) numbers: digits and number words, to a value the record does not contain; a lower bound only moves up
  const numRe = /(?<![A-Za-z0-9.])(\d[\d,]*(?:\.\d+)?)(?=[KMBkmb%x+]?(?![A-Za-z0-9]))|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\b/gi;
  for (const m of claim.matchAll(numRe)) {
    const word = m[2];
    const raw = word || m[1];
    const v = word ? WORDS[word.toLowerCase()] : parseFloat(raw.replace(/,/g, ''));
    if (!word && /^(19|20)\d\d$/.test(raw)) continue;
    const before = claim.slice(Math.max(0, m.index - 14), m.index).toLowerCase(), after = claim.slice(m.index + raw.length, m.index + raw.length + 2);
    const lower = /(over|more than|at least|above|exceed\w*)\s*$/.test(before) || after.startsWith('+') || /\+/.test(claim.slice(m.index, m.index + raw.length + 2));
    // a figure followed by a word ("six weeks", "three CSMs") may take any value no record line states with that word,
    // including values the record uses elsewhere ("2" in "12 days to 2"); a bare figure avoids every recorded value
    const uw = (claim.slice(m.index + raw.length).match(/^[+%kKmMbBx]?[\s-]*([A-Za-z]{3,})/) || [])[1];
    const unitWord = uw && !NOUNLESS.has(uw.toLowerCase()) ? uw.toLowerCase() : null;
    const free = c => (unitWord ? !statedWith(c, unitWord) : !recNums.has(c));
    const cands = [v * 3 + 7, v * 2 + 1, v + 11, Math.round(v * 5.5) + 3, v * 10 + 4, v * 7 + 2, ...(lower ? [] : [v + 1, v - 1, Math.round(v * 0.5), 2, 3, 9, 6])].filter(c => c > (word ? 1 : 0) && c !== v && free(c));
    for (const c of pick(r, cands, 5)) {
      const rep = word ? (WORD_OF[c] || String(c)) : (raw.includes('.') && !Number.isInteger(c) ? String(c) : raw.includes(',') ? c.toLocaleString('en-US') : String(c));
      add('number', claim.slice(0, m.index) + (word && /^[A-Z]/.test(word) ? rep[0].toUpperCase() + rep.slice(1) : rep) + claim.slice(m.index + raw.length));
    }
  }
  // (d) years and months
  for (const m of claim.matchAll(/\b(19|20)\d\d\b/g)) {
    const y = +m[0];
    for (const c of pick(r, [1999, 2004, 2009, 2012, 2014, y - 7, y + 6, y - 11, 2031, 2040].filter(c => c !== y && !recYears.has(c)), 3)) add('year', claim.slice(0, m.index) + c + claim.slice(m.index + 4));
  }
  for (const m of claim.matchAll(new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS.map(x => x.slice(0, 3)).join('|')})\\b(?:\\s+\\d{1,2},?)?\\s+((?:19|20)\\d\\d)`, 'g'))) {
    const y = +m[2];
    const mo = MONTHS.findIndex(x => x.startsWith(m[1].slice(0, 3)));
    const free = MONTHS.map((_, i) => i).filter(i => i !== mo && !recMonthYear.has(`${y}-${i + 1}`));
    for (const i of pick(r, free, 2)) add('month', claim.slice(0, m.index) + m[0].replace(m[1], m[1].length === 3 ? MONTHS[i].slice(0, 3) : MONTHS[i]) + claim.slice(m.index + m[0].length));
  }
  return out;
}

// a claim about holding a title at an employer: a title the record lacks, at each employer, with each of several verbs
export function roleMutants(r) {
  const out = [];
  const employers = [...new Set(data.roles.map(x => x.company))];
  for (const t of titles) for (const e of [...employers, 'Zeta Technologies']) {
    const a = /^[AEIOU]/.test(t) ? 'an' : 'a';
    out.push({ kind: 'title-employer', claim: `He was ${a} ${t} at ${e}.` });
    out.push({ kind: 'title-employer', claim: `Parth is the ${t} of ${e}.` }, { kind: 'title-employer', claim: `He held the title ${t} at ${e}.` }, { kind: 'title-employer', claim: `He worked as ${a} ${t} at ${e}.` });
  }
  for (const f of notEmployers) {
    out.push({ kind: 'intent', claim: `He wants to work at ${f}.` }, { kind: 'intent', claim: `He plans to join ${f}.` }, { kind: 'intent', claim: `He prefers ${f} over Zeta.` });
    out.push({ kind: 'employer', claim: `Parth is employed by ${f}.` }, { kind: 'employer', claim: `He is a full-time employee at ${f}.` }, { kind: 'employer', claim: `He left Zeta to join ${f}.` }, { kind: 'employer', claim: `He works at ${f}.` }, { kind: 'employer', claim: `He joined ${f} in 2024.` }, { kind: 'employer', claim: `He interned at ${f}.` });
    if (r() < 0.5) out.push({ kind: 'employer', claim: `He previously worked at ${f} as a product manager.` });
  }
  return out;
}

export function runFuzz(seed = 20260311) {
  const r = rng(seed);
  const cases = [...jsonl('claims.jsonl'), ...jsonl('paraphrases.jsonl'), ...jsonl('heldout.jsonl')].filter(c => c.expect === 'supported');
  const all = [];
  for (const c of cases) for (const m of mutants(c.claim, r)) all.push({ ...m, from: c.claim });
  for (const m of roleMutants(r)) all.push({ ...m, from: '(role template)' });
  const seen = new Set();
  const uniq = all.filter(m => !seen.has(m.claim) && seen.add(m.claim));
  const bad = [];
  const byKind = {};
  for (const m of uniq) {
    const v = E.proveClaim(data, m.claim).verdict;
    (byKind[m.kind] ||= { n: 0, supported: 0 }).n++;
    if (v === 'supported') { byKind[m.kind].supported++; bad.push({ ...m, verdict: v }); }
  }
  return { sources: cases.length, mutants: uniq.length, supported: bad.length, byKind, bad, foreignNames: foreign.length, titles: titles.length };
}
