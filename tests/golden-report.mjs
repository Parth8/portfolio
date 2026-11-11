// node tests/golden-report.mjs : prints the golden-set numbers and writes data/accuracy.json for the site.
import { writeFileSync } from 'node:fs';
import { runClaims, runSearch, runJobs, runParaphrases, data } from './golden-run.mjs';

const pp = runParaphrases(), c = runClaims(), s = runSearch(), j = runJobs();
const out = {
  updated: new Date().toISOString().slice(0, 10),
  record_updated: data.updated,
  claims: { total: c.total, correct: c.correct, false_confirmations: c.false_confirmations },
  paraphrases: { total: pp.total, supported: pp.supported, false_negatives: pp.false_negatives },
  search: { total: s.total, hits: s.hits, hits_in_top3: s.hits_ok, unanswerable: s.nones, returned_nothing: s.nones_ok, correct: s.correct },
  jobs: { total: j.total, in_range: j.in_range, out_of_family: j.out_of_family, out_of_family_below_40: j.out_of_family_ok, flagged_items: j.flags, flagged_surfaced: j.flags_ok },
};
console.log(`claims  ${c.correct}/${c.total} correct, ${c.false_confirmations} false confirmations`);
console.log(`paraphr ${pp.supported}/${pp.total} true rewordings supported`);
for (const w of pp.wrong) console.log(`  missed: ${w.claim}`);
console.log(`search  ${s.hits_ok}/${s.hits} hits in the top 3; ${s.nones_ok}/${s.nones} unanswerable returned nothing`);
console.log(`jobs    ${j.in_range}/${j.total} in range; ${j.out_of_family_ok}/${j.out_of_family} out-of-family <= 39; ${j.flags_ok}/${j.flags} flagged items surfaced`);
for (const b of j.bad.filter(x => x.want)) console.log(`  out of range: ${b.title} scored ${b.score}, expected ${b.want.join('-')}`);
writeFileSync(new URL('../data/accuracy.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
