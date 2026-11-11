// Years-of-experience arithmetic and the fit score's reproducibility.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../js/career-engine.js';

const data = JSON.parse(readFileSync(new URL('../data/career.json', import.meta.url), 'utf8'));
const jobs = readFileSync(new URL('./golden/jobs.jsonl', import.meta.url), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

test('date maths: whole months from the first role to the record date', () => {
  assert.equal(E.monthsBetween('2021-02', '2026-11'), 69);
  assert.equal(E.monthsBetween('2022-05', '2026-11'), 54);
  assert.equal(E.monthsBetween('2026-11', '2021-02'), 0);
  assert.equal(E.fmtTenure(69), '5 years 9 months');
  assert.equal(E.fmtTenure(54), '4 years 6 months');
  assert.equal(E.fmtTenure(12), '1 year');
  assert.equal(E.fmtTenure(5), '5 months');
  assert.equal(E.fmtYM('2021-02'), 'Feb 2021');
});

test('facts: total tenure is 5.75 years and fintech tenure 4.5 years as of the record date', () => {
  const x = E.facts(data).experience;
  assert.equal(x.since, '2021-02');
  assert.equal(x.months, 69);
  assert.equal(x.years, 5.75);
  assert.equal(x.fintech_since, '2022-05');
  assert.equal(x.fintech_years, 4.5);
  // moving the record date moves both
  const later = { ...data, updated: '2027-02-01' };
  assert.equal(E.facts(later).experience.years, 6);
  assert.equal(E.facts(later).experience.fintech_years, 4.75);
  // consistent with the profile text
  assert.match(x.text, /5\+ years in B2B SaaS \(since Feb 2021\), 4\+ in fintech/);
  assert.ok(x.years >= x.b2b_saas_years_min && x.fintech_years >= x.fintech_years_min);
});

const yearsCheck = text => E.fitFor(data, `Product Manager\nRequirements:\n- ${text}`).hard.find(h => h.type === 'years');

test('fit_for years: a general ask is compared with total tenure and says so', () => {
  const ok = yearsCheck('5+ years of product management experience');
  assert.equal(ok.status, 'pass');
  assert.equal(ok.compared, 'total');
  assert.match(ok.detail, /total tenure \(Feb 2021 to Nov 2026.*5 years 9 months, which meets 5\+/);
  const short = yearsCheck('7+ years of product management');
  assert.equal(short.status, 'fail');
  assert.equal(short.compared, 'total');
  assert.match(short.detail, /5 years 9 months, which is short of 7\+/);
  assert.doesNotMatch(`${ok.detail} ${short.detail} ${ok.have}`, /4\.5/);
});

test('fit_for years: a fintech ask is compared with fintech tenure (Zeta and Backbase, from May 2022)', () => {
  const f = yearsCheck('5+ years in fintech or payments');
  assert.equal(f.compared, 'fintech');
  assert.equal(f.status, 'fail');
  assert.match(f.detail, /fintech tenure \(Zeta and Backbase, May 2022 to Nov 2026\): 4 years 6 months, which is short of 5\+/);
  const p = yearsCheck('4+ years in payments');
  assert.equal(p.status, 'pass');
  assert.equal(p.have, '4 years 6 months in fintech (since May 2022)');
  // no tolerance that turns 4.5 into "meets 5+"
  for (const need of [5, 6]) assert.notEqual(yearsCheck(`${need}+ years in fintech`).status, 'pass');
});

test('fit_for years note names which tenure was compared and matches the profile text', () => {
  const f = E.fitFor(data, 'Senior Product Manager, Payments\nRequirements:\n- 5+ years of product management in fintech or payments\n- Strong SQL');
  const note = f.notes.find(n => n.startsWith('Experience:'));
  assert.match(note, /compared it with his fintech tenure, 4 years 6 months \(Zeta and Backbase, since May 2022\), which falls short of 5\+/);
  assert.match(note, /5\+ years in B2B SaaS \(since Feb 2021\), 4\+ in fintech/);
});

test('fit score is reproducible from score_math, the rows and the notes, for every golden job', () => {
  for (const j of jobs) {
    const f = E.fitFor(data, j.jd);
    if (f.score == null) continue;
    const m = f.score_math, rows = [...f.matches, ...f.gaps];
    const num = rows.reduce((s, r) => s + r.weight * r.confidence, 0), w = rows.reduce((s, r) => s + r.weight, 0);
    const zero = f.requirements.filter(r => r.status === 'unmapped' && !(r.hard || []).length).length;
    const named = f.requirements.filter(r => r.not_on_record).length;
    const failW = f.hard.reduce((s, h) => s + (h.status === 'fail' && h.type !== 'people-management' ? (h.soft || h.near ? 0.4 : 1) : 0), 0);
    const where = `${j.title}: ${JSON.stringify(m)}`;
    assert.ok(Math.abs(w - m.weight) < 0.011 && Math.abs(num - m.numerator) < 0.011, where);
    assert.equal(m.zero_rows.unmapped, zero, where);
    assert.equal(m.zero_rows.named_terms, named, where);
    assert.ok(Math.abs(m.zero_rows.hard_fail_weight - failW) < 0.011, where);
    const den = w + m.zero_rows.each * (zero + named) + failW;
    assert.equal(Math.round(100 * num / den), m.before_caps, where);
    assert.equal(Math.round(100 * num / w), m.weighted_mean, where);
    // caps: each listed cap is stated in notes; the final score is the minimum of the uncapped score and the caps
    for (const c of m.caps) assert.ok(f.notes.includes(c.why), `cap not in notes: ${c.why}`);
    const lowest = m.caps.length ? Math.min(...m.caps.map(c => c.value)) : null;
    assert.equal(m.applied_cap, lowest, where);
    assert.equal(f.score, lowest == null ? m.before_caps : Math.min(m.before_caps, lowest), where);
    // anything below the plain weighted average that is not a cap is stated in one note
    if (den > w + 1e-9) {
      const n = f.notes.find(x => x.startsWith('Score arithmetic:'));
      assert.ok(n, `no arithmetic note: ${where}`);
      assert.ok(n.includes(`is ${m.weighted_mean},`) && n.includes(`from ${m.weight} to ${m.denominator}`) && n.includes(`score is ${m.before_caps}`), n);
    } else assert.equal(m.before_caps, m.weighted_mean, where);
  }
});

test('the sample card-issuing job explains why it is below its plain weighted average', () => {
  const src = readFileSync(new URL('../js/for.js', import.meta.url), 'utf8');
  const jd = src.match(/card: `([\s\S]*?)`,\n  ai:/)[1];
  const f = E.fitFor(data, jd);
  assert.ok(f.score_math.weighted_mean > f.score);
  assert.ok(f.notes.some(n => n.startsWith('Score arithmetic:')));
  assert.ok(f.hard.some(h => h.type === 'years' && h.status === 'fail' && h.compared === 'fintech'));
});
