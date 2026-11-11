// Golden sets (tests/golden/*.jsonl) against the evidence engine. Thresholds are fixed: do not lower them to pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runClaims, runSearch, runJobs } from './golden-run.mjs';

test('golden claims: zero false confirmations, at least 95% accuracy', () => {
  const c = runClaims();
  const show = c.wrong.map(r => `[${r.expect} -> ${r.got.verdict}] ${r.claim}`).join('\n');
  assert.equal(c.false_confirmations, 0, `false confirmations:\n${c.falseConf.map(r => `${r.claim} (${r.expect})`).join('\n')}`);
  assert.ok(c.total >= 140, `only ${c.total} claims`);
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
