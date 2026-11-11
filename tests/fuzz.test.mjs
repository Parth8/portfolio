// Seeded mutation fuzz: thousands of false variants of every supported claim; none may come back "supported".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFuzz, FOREIGN, TITLES } from './mutation-fuzz.mjs';

test('mutation fuzz: no mutant of a supported claim is supported', () => {
  assert.ok(FOREIGN.length >= 60 && TITLES.length >= 20);
  const f = runFuzz();
  assert.ok(f.mutants >= 3000, `only ${f.mutants} mutants`);
  assert.ok(f.foreignNames >= 60 && f.titles >= 20, `${f.foreignNames} names, ${f.titles} titles`);
  for (const k of ['entity-replace', 'entity-insert', 'title-replace', 'title-employer', 'employer', 'intent', 'number', 'year', 'month']) assert.ok(f.byKind[k]?.n > 0, `no ${k} mutants`);
  assert.equal(f.supported, 0, `${f.supported} false confirmations:\n${f.bad.slice(0, 20).map(b => `[${b.kind}] ${b.claim}  <=  ${b.from}`).join('\n')}`);
});
