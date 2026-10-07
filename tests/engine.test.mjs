import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as E from '../js/career-engine.js';

const data = JSON.parse(readFileSync(new URL('../data/career.json', import.meta.url), 'utf8'));

test('prove_claim: true claims are supported, inflated ones differ, invented ones are not found', () => {
  const cases = {
    '0 P1/P2 defects': 'supported', '$2B a year disbursed': 'supported', '$3B a year disbursed': 'differs',
    'built an MCP in 6 weeks': 'supported', 'cut connector build time by 80%': 'supported', '150K cards issued': 'supported',
    '200K cards issued': 'differs', 'saved $50K a year': 'supported', 'saved $500K a year': 'differs',
    'CSAT from 2.5 to 4.6': 'supported', '22 fintechs wound down in 60 days': 'supported',
    'shipped a Kubernetes operator': 'not_found', 'managed a team of 20 PMs': 'not_supported',
  };
  for (const [claim, want] of Object.entries(cases)) assert.equal(E.proveClaim(data, claim).verdict, want, claim);
});

test('fit_for: a card-issuing JD is a strong fit; a consumer-growth director JD is a stretch with honest gaps', () => {
  const card = E.fitFor(data, 'Senior Product Manager, Card Issuing. Own virtual cards, card lifecycle APIs, webhooks, fraud and disputes with sponsor banks and Mastercard. PCI DSS. 6+ years.');
  assert.ok(card.score >= 75, `card score ${card.score}`);
  assert.ok(card.range.low <= card.score && card.score <= card.range.high);
  assert.equal(card.read_first[0].id, 'optum-virtual-cards');
  assert.ok(card.notes.some(n => n.includes('6+ years')));
  const growth = E.fitFor(data, 'Director of Product, Consumer Growth. Manage a team of 6 product managers. Own experimentation, A/B testing and retention for our iOS and Android apps.');
  assert.ok(growth.score <= 44, `growth score ${growth.score}`);
  assert.ok(growth.notes.some(n => n.startsWith('Hard gap')));
  assert.ok(growth.gaps.some(g => g.id === 'people-management'));
  assert.equal(growth.title, 'Director of Product, Consumer Growth');
});

test('fit_for: no recognisable requirements gives a clear message, not a score', () => {
  const f = E.fitFor(data, 'Lorem ipsum dolor sit amet');
  assert.equal(f.score, null);
  assert.match(f.message, /Paste the full job description/);
});

test('every evidence ref in competencies points at a real record', () => {
  const { records } = E.index(data);
  for (const c of data.competencies) for (const ref of c.evidence) assert.ok(records.has(ref), `${c.id} -> ${ref}`);
});

test('proof tiers are earned: every source exists, corroborated needs a corroborating source, verified needs an artifact', () => {
  const ids = new Set(data.sources.map(s => s.id));
  const byId = Object.fromEntries(data.sources.map(s => [s.id, s]));
  for (const r of [...data.cases, ...data.roles, ...data.projects]) {
    for (const id of r.proof.sources) assert.ok(ids.has(id), `${r.id} -> ${id}`);
    const roles = r.proof.sources.map(id => byId[id].role);
    if (r.proof.tier === 'corroborated') assert.ok(roles.includes('corroborates'), `${r.id} has no corroborating source`);
    if (r.proof.tier === 'verified') assert.ok(roles.includes('verifies'), `${r.id} has no verifiable artifact`);
  }
  for (const s of data.sources) if (s.kind !== 'self') assert.match(s.url, /^https:\/\//);
});

test('confidence: resume-only tops out at 0.72, corroborated at 0.82, High needs a public artifact; self-assessment only lowers', () => {
  const { comps } = E.index(data);
  for (const c of comps) {
    const f = E.fitFromIds(data, [{ id: c.id, w: 1 }]);
    const row = [...f.matches, ...f.gaps][0];
    assert.ok(row.confidence >= 0 && row.confidence <= 0.98, c.id);
    const cap = { gap: 0.15, adjacent: 0.45, working: 0.7 }[c.strength];
    if (cap != null) assert.ok(row.confidence <= cap, `${c.id} ${row.confidence} > cap ${cap}`);
    if (row.evidence.length && row.evidence.every(e => e.proof === 'self')) assert.ok(row.confidence <= 0.72, `${c.id} resume-only ${row.confidence}`);
    if (row.evidence.length && row.evidence.every(e => e.proof !== 'verified')) assert.ok(row.confidence <= 0.82, `${c.id} without a public artifact ${row.confidence}`);
    if (row.band === 'High') assert.ok(row.evidence.some(e => e.proof === 'verified'), `${c.id} is High without anything checkable`);
    assert.ok(row.reasons.length && row.math, c.id);
  }
});

test('prove_claim says who vouches: corroborated claims name their public sources', () => {
  const r = E.proveClaim(data, '150K cards issued');
  assert.equal(r.verdict, 'supported');
  assert.equal(r.proof, 'corroborated');
  assert.ok(r.sources.some(s => s.url.includes('zeta.tech')));
  assert.match(E.proveClaim(data, '$2B a year disbursed').explanation, /self-reported/);
});

test('generated files (worker, llms.txt, index.html blocks) are rebuilt from the current sources', () => {
  execFileSync(process.execPath, [new URL('../tools/build.mjs', import.meta.url).pathname, '--check']);
});
