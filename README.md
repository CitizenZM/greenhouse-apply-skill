# greenhouse-apply-skill

Resume, cover letter, and job-application data engine for Barron Zuo. Despite the repo name, this is no longer Greenhouse-specific — it's the shared JD-matching and document-generation backend used by every ATS apply skill in [`claude-config`](https://github.com/CitizenZM/claude-config) (`job-greenhouse-apply`, `job-ashby-apply`, `job-lever-apply`, `job-wellfound-apply`), plus standalone JD-to-resume generation for any role, any platform, any language.

## What this repo does

1. **JD requirement extraction** — parses a job description (English or bilingual, e.g. Chinese JDs for China-outbound roles) into a structured requirement table: must-have vs. nice-to-have, priority, and the best-matching real project from the candidate's experience bank.
2. **Role classification** — automatically identifies whether a target job is Growth, Marketing (PMM/GTM), Sales/RevOps, Operations, FDE/Solutions Engineer, or General, and loads the corresponding role-specific strategy for resume and coverletter generation. See `data/jd-role-classifier.md` for the classification rules.
3. **Resume generation** — maps every bullet in the output resume to a specific JD requirement line, drawing from a canonical, fact-locked experience bank spanning 2010–present (5 companies). Enforces content minimums so output is dense and complete, never thin. Role-specific strategies in `data/role-strategies/` provide tailored guidance for each role category.
4. **Cover letter generation** — 5–6 paragraph structure that always includes a pre-2018 "depth and range" paragraph, so the letter reflects the full career arc rather than starting effectively at the most recent job. Role-specific coverletter strategies in `data/role-strategies/` provide tailored hook, body emphasis, and closing guidance for each role category.
5. **ATS pre-flight scoring** — `~/Projects/claude-config/scripts/ats_preflight.py` scores a generated resume against the actual JD's keyword profile before submission, gated at 65% match minimum.
6. **Job sourcing** — `data/job-sources.json` tracks 164+ verified company career-page APIs (Greenhouse, Ashby, Lever, SmartRecruiters) as a no-login discovery layer, tiered by source reliability.

## Directory structure

```
greenhouse-apply-skill/
├── data/
│   ├── barron-experience-bank.md   canonical source of truth — companies, dates, metrics, projects
│   ├── job-sources.json            164 verified company job-board APIs across 4 ATS platforms
│   ├── answer-bank.md              standard application-form Q&A (EEOC, identity, standard fields)
│   ├── fde-technical-positioning.md   conditional overlay for FDE/Solutions/Implementation/Field/Deployment/Customer Engineer titles — reframes real experience through a technical lens without inventing a CS/SWE background
│   ├── fde_queue.json              203-row sourced queue: FDE/Solutions/Implementation/Field/Deployment/Customer Engineer roles across Greenhouse/Ashby/Lever, scraped 2026-08-10
│   ├── fde_gh_status.json          per-row application status for the FDE queue (queued / company-cap-skip)
│   ├── jd-role-classifier.md       ROLE CLASSIFIER — keyword patterns and classification procedure for identifying whether a JD is Growth, Marketing, Sales/RevOps, Operations, FDE, or General
│   └── role-strategies/            ROLE-SPECIFIC STRATEGIES (one file per role category)
│       ├── growth-strategy.md      Growth: end-to-end funnel ownership, PLG, paid acquisition, experimentation, GEO
│       ├── marketing-strategy.md   Marketing/PMM/GTM: product positioning, messaging, launches, competitive intelligence, sales enablement
│       ├── sales-strategy.md       Sales/RevOps: lead scoring, pipeline velocity, revenue forecasting, CRM, account-based
│       ├── operations-strategy.md  Operations: system integration, data pipeline, automation, budget governance, reporting
│       ├── fde-strategy.md         FDE/Solutions Engineer: customer-embedded implementation, API integration, SQL, automation (complements fde-technical-positioning.md)
│       └── general-strategy.md     General: fallback strategy for roles that don't match any specific category
├── templates/
│   ├── resume-prompt.md            v5 — JD-requirement mapping, content minimums, invention-disclosure protocol, conditional FDE-overlay hook, ROLE CLASSIFICATION (MANDATORY), role-specific strategy loading
│   ├── cover-letter-prompt.md      v3 — 5-paragraph structure incl. mandatory pre-2018 depth paragraph, ROLE CLASSIFICATION (MANDATORY), role-specific coverletter strategies
│   ├── cover-letter-prompt.md      v2 — 5-paragraph structure incl. mandatory pre-2018 depth paragraph
│   └── blank-base-template.docx    empty styled .docx used as the very first template in a resume-generation chain (no prior generated resume to clone formatting from)
├── scripts/
│   ├── generate-resume.py          renders a JSON content payload into a formatted .docx (resume or cover letter), with content-validation gate
│   ├── craft-resume.py             AI-assisted resume/CL drafting helper
│   ├── source-jobs.py              runs the job-sources.json discovery scan, writes a deduplicated queue
│   ├── extract-jd.js / extract-job-list.js / next-job-page.js   browser-side JD/listing scraping
│   ├── fill-application-form.js / submit-application.js / upload-file.js   browser-side form automation
│   └── login.js                    ATS login helper
├── resume-master.json              base resume skeleton — real dates/titles/locations, editable summaries
└── SKILL.md                        legacy skill file (superseded — see note below)
```

> **Note on `SKILL.md`**: this file predates the current architecture (references retired `/greenhouse-setup` and `/greenhouse-apply` commands, an old model-tiering scheme, and the name `greenhouse-job-application`). The authoritative, currently-enforced skill definition is [`skills/job-greenhouse-apply/SKILL.md`](https://github.com/CitizenZM/claude-config/blob/main/skills/job-greenhouse-apply/SKILL.md) in `claude-config`, which is what Claude Code actually loads. This repo's `SKILL.md` is kept for history but should not be treated as current documentation — read this README and the `templates/` files instead.

## The resume-generation pipeline (v5)

### 1. Role Classification (MANDATORY)
Before any drafting, the JD is classified into one of: Growth, Marketing (PMM/GTM), Sales/RevOps, Operations, FDE/Solutions Engineer, or General. See `data/jd-role-classifier.md` for the keyword patterns and classification procedure. The classification determines:
- Which strategy file to load from `data/role-strategies/`
- Which title adaptations to use for each company
- Which keyword priorities to emphasize
- Which coverletter hook strategy to use

### 2. JD requirement extraction
Every requirement in the target JD is logged as a row: `{requirement, priority, best-matching real project, metric to lead with}`. This table drives every bullet that follows — nothing gets written without a specific JD line it answers.

### 3. Full experience-bank read
`data/barron-experience-bank.md` is the single source of truth for facts. Five companies, 2010–present, each with fixed dates/locations/company names and a "Core Metrics" line that may never be altered or invented:

| Company | Period | Role framing |
|---|---|---|
| Alibaba Group (AliExpress US / Alipay) | 2022–Present | Primary selling role — 9-10 bullets |
| Next2Market Consulting & Accelerator | 2020–2022 | Second primary selling role — 7-8 bullets |
| WeWork Labs | 2019–2020 | Advisory framing — 3-4 bullets, must name 2+ of Starbucks/Shiseido/TCL |
| Indiegogo Inc. | 2018–2019 | Execution framing — 3 bullets minimum |
| GSV Global Tech / UGL Consulting | 2010–2016 | Foundation framing — **3 bullets minimum, never omitted, regardless of target role seniority** |

### 4. Role-specific strategy application
Based on the role classification, load the corresponding strategy file from `data/role-strategies/`:
- **Growth** → `data/role-strategies/growth-strategy.md`
- **Marketing** → `data/role-strategies/marketing-strategy.md`
- **Sales/RevOps** → `data/role-strategies/sales-strategy.md`
- **Operations** → `data/role-strategies/operations-strategy.md`
- **FDE** → `data/fde-technical-positioning.md` + `data/role-strategies/fde-strategy.md`
- **General** → `data/role-strategies/general-strategy.md`

Each strategy file provides: JD requirement table template, title adaptation rules, executive summary anchor template, bullet emphasis guidance, keyword priority list, coverletter strategy guidance, and role-specific self-check addendum.

### 5. Content minimums (enforced, not advisory)
26–30 total bullets, no Core Competencies table (removed per 2026-07-30 direction — all keyword coverage lives inside real bullets and the executive summary instead of a separate skills-list table). Every company section renders every time; a resume that drops GSV or thins WeWork to save space is a failed output.

### 6. Gap handling and invented-content disclosure
When a `must-have` JD requirement has no honest match in the experience bank, the pipeline first tries to reframe an adjacent real project. If that's insufficient, it is authorized (by explicit candidate direction, 2026-07-30) to construct a plausible new sub-project or reassign a real metric to a new causal mechanism — but **every such addition must be logged** in an `invented_content_flagged_for_candidate_review` array, with the exact claim, why it required invention, and what the candidate needs to be able to defend if asked about it in an interview. Nothing fabricated ships silently.

**Anachronism constraint (added 2026-08-03):** reframing must never attach a real but *temporally impossible* tool/product name to a pre-2018 bullet (e.g. naming "Clay" — a modern GTM enrichment tool — in a 2010–2016 GSV bullet). This is a fabricated, falsifiable claim, not a stylistic reframe, and is now a hard rule in `resume-prompt.md`/`cover-letter-prompt.md` plus a mechanical check in `generate-resume.py`'s validation gate (see Content-validation gate below).

### 7. ATS pre-flight verification
`scripts/ats_preflight.py` (in `claude-config`) extracts keywords from the JD's actual requirements section — not its culture-copy, benefits, or legal-disclosure boilerplate — and scores the generated resume against them. Fixed 2026-07-29 after a real bug was found: boilerplate phrases (location lists, "recruitment process," culture taglines) were drowning out genuine one-time requirement phrases in frequency-based extraction, producing false "rewrite everything" signals on long JDs. Gate: 65% minimum to submit, 75%+ is "top of stack." Fixed again 2026-08-03: HTML entities (`&amp;`, `&lt;`, `&rsquo;`, etc.) in a saved JD were only partially unescaped (`&nbsp;` only), so encoded entities diluted real keyword matches and produced false-low scores (20–30% on JDs that should have scored 70%+) until manually re-cleaned — now runs `html.unescape()` on the full entity set automatically.

### 8. Content-validation gate (`generate-resume.py`)
Every generated `.docx` is read back and checked before it's allowed to exist — a failure deletes the file and exits non-zero rather than letting a broken document reach a browser tab:
- **Length + structure minimums**: resume ≥2000 chars with all 5 companies present; cover letter ≥1200 chars with a salutation and sign-off.
- **Substantive-body-paragraph count** (added 2026-08-03): requires ≥3 real paragraphs over 100 characters between the salutation and sign-off. Added after a cover letter shipped to a real employer (Pinterest, 2026-07-31) with a greeting immediately followed by the sign-off — zero body content, but a normal-looking file size, since `.docx` boilerplate/styling dominates byte count regardless of actual text. Byte size is not a usable integrity signal; only extracted text length is.
- **Duplicate-sign-off detector** (added 2026-08-03): flags "Sincerely" appearing inside a body paragraph, which duplicates the template's own separate sign-off field. Five letters shipped this way before the check existed.
- **Anachronism detector** (added 2026-08-03): scans bullets under a pre-2018 section header (GSV/UGL 2010–2016, WeWork 2019–2020) for a denylist of well-known post-2018 tools/products (Clay, ChatGPT, Copilot, etc.) and flags any match. Deliberately paragraph/section-scoped, not a whole-document keyword search — an earlier draft of this check used a raw character window and false-flagged tools mentioned in an unrelated, present-day paragraph elsewhere in the same document. Verified against the full corpus of ~290 real generated documents from the 2026-07-30/08-02 application run with zero false positives.

## Known limitations

- `SKILL.md` in this repo is stale (see note above) — do not edit it expecting it to take effect; edit `claude-config/skills/job-greenhouse-apply/SKILL.md` instead.
- `data/seen-job-ids.json` (a dedup cache referenced by `source-jobs.py`) does not currently exist in this repo — it was present in an older backup (23 IDs, since superseded by 5x company-list growth) and was not restored, since the application ledgers are the authoritative dedup source. It will regenerate on first run of `source-jobs.py`.
- The ATS pre-flight scorer's keyword extraction is tuned for English JDs; bilingual/Chinese JDs are checked via manual requirement-coverage review instead (see the 2026-07-30 NA Growth & Integrated Marketing example).
- The anachronism detector's tool denylist (`ANACHRONISTIC_TOOLS` in `generate-resume.py`) is a backstop, not exhaustive — it catches the exact failure class that already shipped once, but relies on the prompt-level hard rule as the primary defense. Extend the list when a new modern tool name shows up in a JD that might tempt a pre-2018 misattribution.

## Changelog

### 2026-08-23 — Role Classification & Role-Specific Strategies (THIS UPDATE)

Added a complete role classification system and role-specific resume/coverletter strategies for all major role categories:

| Change | Files | What it does |
|---|---|---|
| **JD Role Classifier** (new) | `data/jd-role-classifier.md` | Keyword patterns and 7-step classification procedure for identifying whether a JD is Growth, Marketing (PMM/GTM), Sales/RevOps, Operations, FDE/Solutions Engineer, or General. Defines high/medium/low-weight keyword markers for each category, handles hybrid/multi-match cases, and outputs a structured classification with strategy file path, title adaptations, executive summary anchor, and keyword weighting. |
| **Role-Specific Strategies** (new, 6 files) | `data/role-strategies/growth-strategy.md`, `marketing-strategy.md`, `sales-strategy.md`, `operations-strategy.md`, `fde-strategy.md`, `general-strategy.md` | Complete role-specific guidance for resume and coverletter generation for each role category: JD requirement table templates, title adaptation rules, executive summary anchor templates, bullet emphasis guidance, keyword priority lists (high/medium/low ATS weighting), coverletter hook/body/closing templates, and role-specific self-check addenda. |
| **Resume Prompt v5** (updated) | `templates/resume-prompt.md` | Added MANDATORY Role Classification section (7-step procedure, strategy file loading table, title adaptation selection rules), role-specific self-check addendum, `role_classification` block in output JSON. |
| **Cover Letter Prompt v3** (updated) | `templates/cover-letter-prompt.md` | Added MANDATORY Role Classification section, role-specific coverletter strategy guidance (hook/body/closing for each role type), role-specific self-check addendum, `role_classification` block in output JSON. |
| **README update** | `README.md` | Added role classification and role-specific strategies to directory structure, pipeline description, and changelog. |

**What this enables**: the greenhouse skill can now automatically identify the target role category from the JD and select the most appropriate resume and coverletter generation strategy for each role apply — Growth roles get funnel-ownership framing with PLG/paid/experimentation emphasis; Marketing roles get product positioning/narrative framing with competitive intelligence emphasis; Sales/RevOps roles get pipeline/forecasting/CRM framing; Operations roles get system integration/automation/governance framing; FDE roles get customer-embedded technical framing via the 2026-08-16 FDE overlay; and General roles get a fallthrough strategy that still enforces all v4/v2 rules. Every role apply gets a role-appropriate resume and coverletter, not a one-size-fits-all document.

### 2026-08-16 — Greenhouse job application upgrade Aug 16: FDE/Solutions Engineer positioning overlay

Added a durable, reusable positioning layer so the existing resume-generation pipeline can produce credible Forward Deployed Engineer / Solutions Engineer / Implementation Engineer / Field Engineer / Deployment Engineer / Customer Engineer applications without touching the immutable base facts file (`data/barron-experience-bank.md`) and without ever fabricating a CS degree or SWE title the candidate doesn't have.

| Change | File | What it does |
|---|---|---|
| FDE technical-positioning overlay (new) | `data/fde-technical-positioning.md` | Reframes real Alibaba/Next2Market/WeWork Labs/Indiegogo/GSV experience through a technical/systems lens for FDE-style audiences: names the real technical surface area (PicoPilot AI build, multi-system attribution pipeline, agentic automation, SQL, Alipay API integration, WeWork Labs as a direct embedded-customer analog), sets hard boundaries on what may never be claimed (CS degree, SWE title, unfounded programming-language fluency), gives per-company FDE title adaptations, a keyword-mapping table, Executive Summary/Cover Letter patterns, and a 5-point FDE-specific self-check addendum run in addition to the base Step 8 checklist. |
| Conditional overlay hook | `templates/resume-prompt.md` | New line under `## Input`: if the target role title or JD text matches FDE/Solutions/Implementation/Field/Deployment/Customer Engineer, the generator also reads the overlay file in full and applies its title adaptations and patterns *on top of*, not instead of, the base experience bank. Non-FDE roles are unaffected — the overlay never fires for them. |
| FDE application queue (new, data) | `data/fde_queue.json`, `data/fde_gh_status.json` | 203-row sourced queue of FDE/Solutions/Implementation/Field/Deployment/Customer Engineer roles across Greenhouse, Ashby, and Lever (public ATS API scan, 2026-08-10), tiered `Tier 1 - Forward Deployed` / `Tier 2 - Adjacent`, with per-row status tracking (65 queued, 13 company-cap-skip at time of commit). |
| Blank base template (new) | `templates/blank-base-template.docx` | Empty styled `.docx` used as the seed template the very first time a resume is generated in a fresh session, before any prior generated resume exists to clone formatting from. |

**Validated in production**: the overlay was exercised across ~15 real submitted applications this run (Aircall, Authenticx, AHEAD, Hightouch, Fin/Intercom, Labelbox, Addepar, Abridge, Column, Persona, Varick Agents, Figma, Clera, Cresta, Mesh, and others), plus a much larger triage pass (~370+ candidate roles read and screened end-to-end against a consistent location/salary/coding-bar/seniority rubric) to separate genuinely viable roles from Tier-1 "Forward Deployed Engineer" titles that turn out to require a real production-software-engineering background the candidate doesn't have. Every skip is logged with a specific reason (not just "skipped") in the application ledgers in `claude-obsidian-vault`.

**What the overlay deliberately does not do**: it does not lower the bar on the anachronism detector, the content-validation gate, or the ATS pre-flight scorer described below — those checks run unchanged on FDE-overlay output. It also does not touch `data/barron-experience-bank.md`; every fact, date, and metric an FDE resume uses still traces back to that single canonical file.

### 2026-08-03 — Content-validation gate hardening

Root-caused and fixed 3 defect classes found via manual/QA review of the 2026-07-30 through 2026-08-02 application run (41 applications across Greenhouse/Ashby/Lever):

| Fix | File | What it catches |
|---|---|---|
| Substantive-body-paragraph count | `scripts/generate-resume.py` | Blank/scaffold cover letters (shipped once, live, to Pinterest) |
| Duplicate-sign-off detector | `scripts/generate-resume.py` | LLM writing its own "Sincerely" inside the body, doubling the template's sign-off (shipped on ≥2 already-submitted letters) |
| Anachronism detector + prompt rule | `scripts/generate-resume.py`, `templates/resume-prompt.md`, `templates/cover-letter-prompt.md` | Modern tool/product names attributed to pre-2018 experience (shipped once, live, to Render — a "Clay-style" claim on a 2010–2016 bullet) |

All three are mechanical checks added on top of, not instead of, the corresponding prompt-level instructions — the goal is to catch it even when the generation step itself fails to follow the rule. See `claude-config`'s README/CLAUDE.md changelog for the companion `ats_preflight.py` and orchestration-level fixes (pre-dispatch dedup, sequential-only Chrome dispatch, stale ego-lite guidance) made in the same pass.

## Related repos

| Repo | Role |
|---|---|
| [`claude-config`](https://github.com/CitizenZM/claude-config) | Skill/command definitions, `ats_preflight.py`, the actual `job-greenhouse-apply` / `job-ashby-apply` / `job-lever-apply` / `job-wellfound-apply` skills that call into this repo |
| `claude-obsidian-vault` (private) | Live application ledgers (`{ATS}-Application-Ledger.md`) — dedup source of truth |
