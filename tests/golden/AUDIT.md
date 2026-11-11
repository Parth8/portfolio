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
