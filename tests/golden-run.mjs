// Runs the three golden sets (tests/golden/*.jsonl) against the engine and returns the numbers.
// Shared by golden.test.mjs (thresholds) and golden-report.mjs (prints and writes data/accuracy.json).
import { readFileSync } from 'node:fs';
import * as E from '../js/career-engine.js';

const here = p => new URL(p, import.meta.url);
export const data = JSON.parse(readFileSync(here('../data/career.json'), 'utf8'));
const jsonl = f => readFileSync(here(`./golden/${f}`), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9+$%]+/g, ' ').split(' ').filter(w => w.length > 2);
const WHERE = { profile: /^profile:/, awards: /^award:/, certifications: /^cert:/, writing: /^writing:/, skills: /^skill:/ };

export function runClaims() {
  const rows = jsonl('claims.jsonl').map(c => ({ ...c, got: E.proveClaim(data, c.claim) }));
  const wrong = rows.filter(r => r.got.verdict !== r.expect);
  const falseConf = rows.filter(r => r.expect !== 'supported' && r.got.verdict === 'supported');
  return { total: rows.length, correct: rows.length - wrong.length, false_confirmations: falseConf.length, wrong, falseConf };
}

// natural rewordings of true record lines: each must be supported (a false negative otherwise)
export function runParaphrases() {
  const rows = jsonl('paraphrases.jsonl').map(c => ({ ...c, got: E.proveClaim(data, c.claim) }));
  const lines = E.index(data).units.map(u => u.line);
  const unsourced = rows.filter(r => !lines.some(l => l.includes(r.source)));
  const wrong = rows.filter(r => r.got.verdict !== 'supported');
  return { total: rows.length, supported: rows.length - wrong.length, false_negatives: wrong.length, wrong, unsourced, kinds: [...new Set(rows.map(r => r.kind))] };
}

export function runSearch() {
  const rows = jsonl('search.jsonl');
  const bad = [];
  let hits = 0, hitOk = 0, nones = 0, noneOk = 0;
  for (const c of rows) {
    const res = E.searchEvidence(data, c.query, 8);
    if (c.expect === 'none') {
      nones++;
      if (res.length === 0) noneOk++; else bad.push({ ...c, got: res.slice(0, 3).map(r => r.quote) });
      continue;
    }
    hits++;
    const top = res.slice(0, 3);
    const inc = String(c.must_include || '').toLowerCase();
    const okText = inc && top.some(r => r.quote.toLowerCase().includes(inc));
    const okPlace = c.where && top.some(r => (WHERE[c.where] ? WHERE[c.where].test(r.ref) : r.ref === c.where));
    if (okText || okPlace) hitOk++; else bad.push({ ...c, got: top.map(r => `${r.ref}: ${r.quote}`) });
  }
  return { total: rows.length, hits, hits_ok: hitOk, nones, nones_ok: noneOk, correct: hitOk + noneOk, bad };
}

// a must_flag item is surfaced when the hard / unmapped lists (or the family note) mention its words
export function flagged(fit, flag) {
  if (/not a product role/i.test(flag)) return fit.family?.in_scope === false;
  const text = [...(fit.hard || []).map(h => `${h.requirement} ${h.need} ${h.detail}`), ...(fit.unmapped || []).map(u => u.text), ...(fit.requirements || []).filter(r => r.status === 'unmapped').map(r => r.text)].join(' ').toLowerCase();
  const ws = words(flag).filter(w => !['and', 'the', 'experience', 'knowledge', 'required', 'years'].includes(w));
  if (!ws.length) return false;
  const have = ws.filter(w => text.includes(w.replace(/s$/, '')));
  return have.length >= Math.ceil(ws.length * 0.5);
}

export function runJobs() {
  const rows = jsonl('jobs.jsonl');
  const bad = [];
  let inRange = 0, fam = 0, famOk = 0, flags = 0, flagsOk = 0;
  const detail = [];
  for (const j of rows) {
    const f = E.fitFor(data, j.jd);
    const score = f.score == null ? 0 : f.score;
    const ok = score >= j.expect_min && score <= j.expect_max;
    if (ok) inRange++; else bad.push({ title: j.title, score, want: [j.expect_min, j.expect_max] });
    if (j.expect_max <= 35) { fam++; if (score <= 39) famOk++; else bad.push({ title: j.title, out_of_family_score: score }); }
    const missed = [];
    for (const m of j.must_flag || []) { flags++; if (flagged(f, m)) flagsOk++; else missed.push(m); }
    detail.push({ title: j.title, score, band: f.band, family: f.family?.name, in_scope: f.family?.in_scope, missed });
  }
  return { total: rows.length, in_range: inRange, out_of_family: fam, out_of_family_ok: famOk, flags, flags_ok: flagsOk, bad, detail };
}
