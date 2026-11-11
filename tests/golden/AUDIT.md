# Golden set audit

Every case was checked against data/career.json. Rules used: `differs` when the record states a single value for what the
claim asserts (title at a company, current location, immigration status, sponsor bank, a number or date); `not_found`
when the claim adds something the record never mentions (another employer, degree, certification, award, skill, place
lived); absolute overclaims (never, every, all) are never `supported` unless the record line says so itself.

## claims.jsonl (150 -> 178)
Changed (10):
- "Part two of Zero to a Hundred has 14 phases" -> "Zero to a Hundred has 30 phases": ambiguous (14 is the size of part one); record says 22 in total.
- Jira 2.0 "live Jira Cloud instance" -> "makes network calls to answer questions": the original named something the record never mentions, so it was not_found, not differs.
- Map Poster Studio "Overpass as the primary source" -> "only from Overpass": "primary" is not record wording; "only" is a checkable overclaim.
- not_found -> differs: US H-1B visa, US green card (the record states his one status, B1/B2 business travel); Senior PM at Backbase (promoted), Chief Product Officer at Zeta, Software Engineer at HackerEarth (the record states his title at each employer); Zeta intern in 2019 (every Zeta role is dated May 2022 to Aug 2026).
- "Parth has worked at Zeta": source corrected.

Added (28): the examples from the failure list (Stripe, Bengaluru, Chase, Visa rails at Optum, green card, Kubernetes, "never shipped anything with defects", B.Tech from PES, an award, 5+ years B2B SaaS, TPM at Zeta 2024-2026) plus employer, title, date, education, visa, language and client-versus-employer cases. Deleted: none. One claim I drafted ("built a payments platform at Zeta") was dropped as ambiguous.

## search.jsonl (60 -> 63)
No case was wrong. Added: "Has he worked with Kubernetes?" (none), "What did he do at HackerEarth?", "Which awards has he won?".

## jobs.jsonl (30)
No case changed except the family tag of the Solutions Engineer job (`sales` -> `client-technical`, an in-scope adjacent role). Ranges were kept even where the engine disagrees: Product Operations Manager scores 74 against an expected 45-65 (his Jira, analytics and release evidence is direct; only the Salesforce credential is missing). That is the one out-of-range case; 29 of 30 are in range.

## Harness notes
`must_flag` items are matched loosely by keyword against the `hard` list, the `unmapped` list (which carries `reason`: none, named-terms or adjacent) and, for "not a product role", `family.in_scope === false`. "unclear", "partial" count as wrong for accuracy, never as false confirmations.

## Second pass (paraphrases, near-miss twins, years, score arithmetic)
- `paraphrases.jsonl` (80, new): true claims, each a recruiter-style rewording of one verbatim record line (`source`), covering every case study, every role, every project, profile, education, visa, awards, a certification and a writing item. The harness requires >= 92% supported and checks that every `source` really is on the record.
- `claims.jsonl` 178 -> 225: 47 near-miss twins (`kind` starts with `twin-`), each a paraphrase with exactly one decisive part changed (a number, a unit, a company, a bank, a network, a year, a place, or two swapped figures). Expectation rule as before: a record value that is different -> `differs`; a name the record never mentions as an employer -> `not_found`. Three twins were reworded while writing them because the first wording changed two things at once ("Cross River Bank" -> "Citibank", the sponsor-bank twin now asks about "Visa rails").
- `tests/engine.test.mjs`: the card-issuing fixture asked for "6+ years" and expected a score of 85+. The old engine passed it only through a +0.5 year tolerance on a wrong 4.5-year ceiling. His total tenure is 5 years 9 months, so "6+" is a genuine near miss; the fixture now asks for "5+ years" (which he meets). A 6+ ask is covered by `tests/fit.test.mjs`.
- Product Operations Manager still scores 74 against 45-65 (unchanged, see above).

## Third pass: held-out claims, mutation fuzz, structural fixes
A reviewer's fresh claims still produced false confirmations while every golden set passed, so the checker had been fitted to the listed strings. What changed:
- `tests/mutation-fuzz.mjs` + `tests/fuzz.test.mjs`: every supported claim in claims, paraphrases and heldout (156) is mutated, seeded and deterministic, into 5,279 false claims: a name the record never mentions (68 employers, banks, networks, tools) replaced or inserted, a job title not on the record (20) replaced or put at each employer, every number (digits and number words) moved to a value no line states with that word, every year and month changed, and intent statements. None may be `supported`. Run against the engine before this pass it found 17 supported mutants (CEO at Zeta, "employed by Google", "interned at Google", a wrong start year after "more than five years", "2" matching the bare "~2" of "12 days to ~2" and "6 internal PMs" matching "6 weeks").
- `tests/golden/heldout.jsonl` (60: 20 true rewordings, 40 false: employers, titles, durations, numbers, dates, intent, tools, a certification, an award) was written after the engine had been tuned on the other sets and run once before any fixing.
  First raw run: true claims supported 17/20 (missed: "His Zeta stint ended in August 2026", "ran a 22-fintech shutdown ... inside 60 days", "Shelfie's progress system has streaks, goals and 20 badges"); false claims 40: 5 FALSE CONFIRMATIONS ("interned at Microsoft", "employed by Accenture", "shipped the Connector Studio MCP in two weeks", "worked at HackerEarth for five years", "wants to move to the US") and 29/40 with the right verdict.
  After the structural fixes below: true 20/20, false confirmations 0, right verdict 40/40. One label was changed after the first run: "He deployed Track on AWS Lambda" was expected `differs`; the record never mentions Lambda (AWS appears only for the data platform), so by the audit rule above it is `not_found`.
- Causes, fixed in general rather than per string: (1) employment claims were decided by any line sharing words ("CEO Office", Google as a client). `employmentGate` now decides them from the typed employment facts: an organisation named after works at / employed by / joined / interned at / left ... to join must be one of his employers, and every word of a title must be in his title at the employer named; (2) needs, wants, plans and preferences are never evidenced by a line that shares words: only `profile:open_to` and the visa fact are consulted and the answer is `unclear` or `not_found`; (3) a bare figure matched any figure carrying a unit ("2 weeks" against "~2"), now it must share the unit or noun; (4) years/dates after "N+ years in B2B SaaS" were not checked against the start date; (5) durations at an employer are compared with role dates; (6) abbreviations are one word in both directions (a built-in list plus every "ABBR (long form)" the record defines), number words reach 90, "a decade", "quicker/faster" are synonyms; (7) a month-name prefix test ("mar" in "marketing", "dec" in "Decta") dropped title and organisation words.
- Golden expectations changed: none.
