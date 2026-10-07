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
  assert.ok(card.score >= 85, `card score ${card.score}`);
  assert.equal(card.read_first[0].id, 'optum-virtual-cards');
  assert.ok(card.notes.some(n => n.includes('6+ years')));
  const growth = E.fitFor(data, 'Director of Product, Consumer Growth. Manage a team of 6 product managers. Own experimentation, A/B testing and retention for our iOS and Android apps.');
  assert.ok(growth.score < 50, `growth score ${growth.score}`);
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

test('confidence: every score cites lines that are really on the record, with reasons and the maths', () => {
  const { records } = E.index(data);
  const lines = new Set([...records.values()].flatMap(r => [r.summary, ...r.evidence]));
  for (const p of Object.keys(E.PERSONAS)) {
    const f = E.fitFor(data, '', { persona: p });
    for (const m of [...f.matches, ...f.gaps]) {
      assert.ok(m.confidence >= 0 && m.confidence <= 0.97, `${m.id} ${m.confidence}`);
      assert.ok(m.reasons.length && m.math.length, m.id);
      for (const e of m.evidence) assert.ok(lines.has(e.quote), `${m.id} quotes a line that isn't on the record: ${e.quote}`);
    }
  }
});

test('confidence: self-assessment only ever lowers a score; one place alone stays below Strong', () => {
  const { comps } = E.index(data);
  for (const c of comps) {
    const row = (f => [...f.matches, ...f.gaps][0])(E.fitFromIds(data, [{ id: c.id, w: 1 }]));
    const cap = { gap: 0.15, adjacent: 0.45, working: 0.7 }[c.strength];
    if (cap != null) assert.ok(row.confidence <= cap, `${c.id} ${row.confidence} > ${cap}`);
    const places = new Set(row.evidence.map(e => e.kind === 'project' ? e.ref : e.org));
    if (row.evidence.length && places.size === 1) assert.ok(row.confidence <= 0.75, `${c.id} reached ${row.confidence} from one place`);
  }
});

test('server/worker.js is rebuilt from the current sources', () => {
  execFileSync(process.execPath, [new URL('../tools/build-worker.mjs', import.meta.url).pathname, '--check']);
});
