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
