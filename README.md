# greenhouse-apply-skill

Resume, cover letter, and job-application data engine for Barron Zuo. Despite the repo name, this is no longer Greenhouse-specific — it's the shared JD-matching and document-generation backend used by every ATS apply skill in [`claude-config`](https://github.com/CitizenZM/claude-config) (`job-greenhouse-apply`, `job-ashby-apply`, `job-lever-apply`, `job-wellfound-apply`), plus standalone JD-to-resume generation for any role, any platform, any language.

## What this repo does

1. **JD requirement extraction** — parses a job description (English or bilingual, e.g. Chinese JDs for China-outbound roles) into a structured requirement table: must-have vs. nice-to-have, priority, and the best-matching real project from the candidate's experience bank.
2. **Resume generation** — maps every bullet in the output resume to a specific JD requirement line, drawing from a canonical, fact-locked experience bank spanning 2010–present (5 companies). Enforces content minimums so output is dense and complete, never thin.
3. **Cover letter generation** — 5–6 paragraph structure that always includes a pre-2018 "depth and range" paragraph, so the letter reflects the full career arc rather than starting effectively at the most recent job.
4. **ATS pre-flight scoring** — `~/Projects/claude-config/scripts/ats_preflight.py` scores a generated resume against the actual JD's keyword profile before submission, gated at 65% match minimum.
5. **Job sourcing** — `data/job-sources.json` tracks 164+ verified company career-page APIs (Greenhouse, Ashby, Lever, SmartRecruiters) as a no-login discovery layer, tiered by source reliability.

## Directory structure

```
greenhouse-apply-skill/
├── data/
│   ├── barron-experience-bank.md   canonical source of truth — companies, dates, metrics, projects
│   ├── job-sources.json            164 verified company job-board APIs across 4 ATS platforms
│   └── answer-bank.md              standard application-form Q&A (EEOC, identity, standard fields)
├── templates/
│   ├── resume-prompt.md            v4 — JD-requirement mapping, content minimums, invention-disclosure protocol
│   └── cover-letter-prompt.md      v2 — 5-paragraph structure incl. mandatory pre-2018 depth paragraph
├── scripts/
│   ├── generate-resume.py          renders a JSON content payload into a formatted .docx (resume or cover letter)
│   ├── craft-resume.py             AI-assisted resume/CL drafting helper
│   ├── source-jobs.py              runs the job-sources.json discovery scan, writes a deduplicated queue
│   ├── extract-jd.js / extract-job-list.js / next-job-page.js   browser-side JD/listing scraping
│   ├── fill-application-form.js / submit-application.js / upload-file.js   browser-side form automation
│   └── login.js                    ATS login helper
├── resume-master.json              base resume skeleton — real dates/titles/locations, editable summaries
└── SKILL.md                        legacy skill file (superseded — see note below)
```

> **Note on `SKILL.md`**: this file predates the current architecture (references retired `/greenhouse-setup` and `/greenhouse-apply` commands, an old model-tiering scheme, and the name `greenhouse-job-application`). The authoritative, currently-enforced skill definition is [`skills/job-greenhouse-apply/SKILL.md`](https://github.com/CitizenZM/claude-config/blob/main/skills/job-greenhouse-apply/SKILL.md) in `claude-config`, which is what Claude Code actually loads. This repo's `SKILL.md` is kept for history but should not be treated as current documentation — read this README and the `templates/` files instead.

## The resume-generation pipeline (v4)

### 1. JD requirement extraction
Every requirement in the target JD is logged as a row: `{requirement, priority, best-matching real project, metric to lead with}`. This table drives every bullet that follows — nothing gets written without a specific JD line it answers.

### 2. Full experience-bank read
`data/barron-experience-bank.md` is the single source of truth for facts. Five companies, 2010–present, each with fixed dates/locations/company names and a "Core Metrics" line that may never be altered or invented:

| Company | Period | Role framing |
|---|---|---|
| Alibaba Group (AliExpress US / Alipay) | 2022–Present | Primary selling role — 9-10 bullets |
| Next2Market Consulting & Accelerator | 2020–2022 | Second primary selling role — 7-8 bullets |
| WeWork Labs | 2019–2020 | Advisory framing — 3-4 bullets, must name 2+ of Starbucks/Shiseido/TCL |
| Indiegogo Inc. | 2018–2019 | Execution framing — 3 bullets minimum |
| GSV Global Tech / UGL Consulting | 2010–2016 | Foundation framing — **3 bullets minimum, never omitted, regardless of target role seniority** |

### 3. Content minimums (enforced, not advisory)
26–30 total bullets, no Core Competencies table (removed per 2026-07-30 direction — all keyword coverage lives inside real bullets and the executive summary instead of a separate skills-list table). Every company section renders every time; a resume that drops GSV or thins WeWork to save space is a failed output.

### 4. Gap handling and invented-content disclosure
When a `must-have` JD requirement has no honest match in the experience bank, the pipeline first tries to reframe an adjacent real project. If that's insufficient, it is authorized (by explicit candidate direction, 2026-07-30) to construct a plausible new sub-project or reassign a real metric to a new causal mechanism — but **every such addition must be logged** in an `invented_content_flagged_for_candidate_review` array, with the exact claim, why it required invention, and what the candidate needs to be able to defend if asked about it in an interview. Nothing fabricated ships silently.

### 5. ATS pre-flight verification
`scripts/ats_preflight.py` (in `claude-config`) extracts keywords from the JD's actual requirements section — not its culture-copy, benefits, or legal-disclosure boilerplate — and scores the generated resume against them. Fixed 2026-07-29 after a real bug was found: boilerplate phrases (location lists, "recruitment process," culture taglines) were drowning out genuine one-time requirement phrases in frequency-based extraction, producing false "rewrite everything" signals on long JDs. Gate: 65% minimum to submit, 75%+ is "top of stack."

## Known limitations

- `SKILL.md` in this repo is stale (see note above) — do not edit it expecting it to take effect; edit `claude-config/skills/job-greenhouse-apply/SKILL.md` instead.
- `data/seen-job-ids.json` (a dedup cache referenced by `source-jobs.py`) does not currently exist in this repo — it was present in an older backup (23 IDs, since superseded by 5x company-list growth) and was not restored, since the application ledgers are the authoritative dedup source. It will regenerate on first run of `source-jobs.py`.
- The ATS pre-flight scorer's keyword extraction is tuned for English JDs; bilingual/Chinese JDs are checked via manual requirement-coverage review instead (see the 2026-07-30 NA Growth & Integrated Marketing example).

## Related repos

| Repo | Role |
|---|---|
| [`claude-config`](https://github.com/CitizenZM/claude-config) | Skill/command definitions, `ats_preflight.py`, the actual `job-greenhouse-apply` / `job-ashby-apply` / `job-lever-apply` / `job-wellfound-apply` skills that call into this repo |
| `claude-obsidian-vault` (private) | Live application ledgers (`{ATS}-Application-Ledger.md`) — dedup source of truth |
