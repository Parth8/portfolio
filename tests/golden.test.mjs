// Golden sets (tests/golden/*.jsonl) against the evidence engine. Thresholds are fixed: do not lower them to pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runClaims, runSearch, runJobs, runParaphrases, runHeldout } from './golden-run.mjs';
import { readFileSync } from 'node:fs';

test('golden claims: zero false confirmations, at least 95% accuracy', () => {
  const c = runClaims();
  const show = c.wrong.map(r => `[${r.expect} -> ${r.got.verdict}] ${r.claim}`).join('\n');
  assert.equal(c.false_confirmations, 0, `false confirmations:\n${c.falseConf.map(r => `${r.claim} (${r.expect})`).join('\n')}`);
  assert.ok(c.total >= 140, `only ${c.total} claims`);
  const twins = readFileSync(new URL('./golden/claims.jsonl', import.meta.url), 'utf8').split('\n').filter(l => l.includes('"twin-')).length;
  assert.ok(twins >= 30, `only ${twins} near-miss twins`);
  assert.ok(c.correct / c.total >= 0.95, `accuracy ${c.correct}/${c.total}\n${show}`);
});

test('golden search: >= 90% of hits land in the top 3, >= 90% of unanswerable queries return nothing', () => {
  const s = runSearch();
  assert.ok(s.total >= 55, `only ${s.total} searches`);
  const bad = s.bad.map(b => `${b.query} => ${JSON.stringify(b.got)}`).join('\n');
  assert.ok(s.hits_ok / s.hits >= 0.9, `hits ${s.hits_ok}/${s.hits}\n${bad}`);
  assert.ok(s.nones_ok / s.nones >= 0.9, `none ${s.nones_ok}/${s.nones}\n${bad}`);
});

test('golden jobs: scores in range, out-of-family roles stay low, hard requirements are flagged', () => {
  const j = runJobs();
  assert.ok(j.total >= 28, `only ${j.total} jobs`);
  const bad = JSON.stringify(j.bad, null, 1);
  assert.ok(j.in_range / j.total >= 0.9, `in range ${j.in_range}/${j.total}\n${bad}`);
  assert.equal(j.out_of_family_ok, j.out_of_family, `out-of-family roles scoring above 39\n${bad}`);
  assert.ok(j.flags_ok / j.flags >= 0.85, `flags ${j.flags_ok}/${j.flags}\n${JSON.stringify(j.detail.filter(d => d.missed.length), null, 1)}`);
});

test('golden paraphrases: true rewordings are supported in >= 92% of cases, each cites a verbatim record line', () => {
  const p = runParaphrases();
  assert.ok(p.total >= 60, `only ${p.total} paraphrases`);
  assert.equal(p.unsourced.length, 0, `source not on the record:\n${p.unsourced.map(r => r.source).join('\n')}`);
  for (const k of ['case', 'role', 'project', 'profile', 'award']) assert.ok(p.kinds.includes(k), `no ${k} paraphrase`);
  const show = p.wrong.map(r => `[${r.got.verdict}] ${r.claim}`).join('\n');
  assert.ok(p.supported / p.total >= 0.92, `supported ${p.supported}/${p.total}\n${show}`);
});

test('held-out claims: zero false confirmations, >= 90% of true ones supported, >= 90% of false ones with the right verdict', () => {
  const h = runHeldout();
  assert.ok(h.total >= 60 && h.true_total >= 20 && h.false_total >= 40, `only ${h.total} held-out claims`);
  const show = h.wrong.map(r => `[${r.expect} -> ${r.got.verdict}] ${r.claim}`).join('\n');
  assert.equal(h.false_confirmations, 0, show);
  assert.ok(h.true_supported / h.true_total >= 0.9, `true ${h.true_supported}/${h.true_total}\n${show}`);
  assert.ok(h.exact / h.false_total >= 0.9, `false ${h.exact}/${h.false_total}\n${show}`);
});
