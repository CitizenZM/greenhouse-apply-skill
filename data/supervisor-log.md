# Greenhouse Supervisor Log — 2026-04-17

## Architecture
- **Supervisor**: Opus — orchestrates workflow, monitors errors, optimizes skill
- **Workers**: Sonnet agents — resume/CL generation per job
- **Mechanical**: Opus direct — browser navigation, form filling, submission
- **Optimization cycle**: Every 5 completed applications → SKILL.md upgrade

## Session State
- Jobs completed this session: 18
- Jobs failed this session: 0
- Context refresh threshold: 3 jobs per batch
- Optimization trigger: every 5 completions

## Job Processing Log

| # | Company | Title | Status | Time | Notes |
|---|---------|-------|--------|------|-------|
| 1 | Signal and Strand | Global Product Marketing Director | SUBMITTED | ~4min | Resume agent: 57s/13.7K tokens. Form had auto-attached generic resume that needed removal. |
| 2 | OneTrust | Sr Growth Marketing Manager (SEO, AEO) | SUBMITTED | ~3min | Resume+CL agent: 52s/9.9K tokens. Both resume and CL uploaded. Data Protection option was "Acknowledge/Confirm" not "agree". EEO fields needed scrollIntoView. |
| 3 | Cockroach Labs | Sr. Marketing Content Strategist, AI Visibility | SKIPPED | <1min | NYC office confirmation required; Barron in SF. |
| 4 | Unity Technologies | Integrated Marketing Manager - AI | SUBMITTED | ~3min | Iframe embed: Grnhse.Iframe.load() needed manual invocation. Resume+CL agent: 70s/15.8K tokens. Form inside iframe — all interactions via frameLocator. |
| 5 | Apollo.io | Senior Marketing Manager | SUBMITTED | ~2min | Simple form: 6 text fields + country + resume only. No CL upload, no EEO. Fastest submission yet. Resume agent: 59s/15.8K tokens. |
| 6 | Eve | Vice President, Product Marketing | SUBMITTED | ~3min | Direct Greenhouse page. Resume+CL agent. 6 text fields + 10 comboboxes + resume + CL. Salary field, SMS consent, certification fields present. |
| 7 | Revolution Medicines | Director, Marketing | SUBMITTED | ~3min | Iframe embed (already loaded). Resume+CL generated directly (Sonnet agent permission-blocked). 4 text fields + 7 comboboxes + resume + CL. No EEO. Bay Area/office confirmation questions. |
| 8 | Obsidian Security | Sr Product Marketing Manager - Partner | SUBMITTED | ~3min | Direct Greenhouse page. Resume+CL. 6 text + 9 selects + resume + CL. Has EEO + reCAPTCHA (invisible, auto-solved). File input needed parent container unhide for upload. |
| 9 | Revolution Medicines | Associate Director, Marketing | SUBMITTED | ~3min | Iframe embed (already loaded). Resume+CL. Same RevMed form structure as Job #7. |
| 10 | Revolution Medicines | Director, Global Marketing | SUBMITTED | ~3min | Iframe embed. Resume+CL. Combined upload+submit for efficiency. New "How did you hear" select field handled. |
| 11 | Verkada | Sr. Tradeshow and Event Marketing Manager | SUBMITTED | ~3min | Direct Greenhouse page (NYC). Resume+CL. Standard form with EEO fields. |

## Error Log

| Timestamp | Job | Error | Resolution |
|-----------|-----|-------|------------|
| Job1 | Signal and Strand | browser_fill_form ref not found | Used browser_evaluate with nativeInputValueSetter instead |
| Job1 | Signal and Strand | setInputFiles timeout (hidden file input) | Made input visible first, then setInputFiles worked |
| Job1 | Signal and Strand | Auto-attached generic resume from MyGreenhouse profile | Found "Remove file" button via aria-label, removed, then uploaded tailored resume |

## Optimization Notes
(Collected during processing, applied to SKILL.md every 5 jobs)

### Batch 1 (Jobs #1-5) — Applied to SKILL.md 2026-04-17
1. browser_fill_form requires snapshot refs — use nativeInputValueSetter instead
2. MyGreenhouse auto-attaches profile resume — must remove before uploading
3. Country field is react-select — pressSequentially + option click
4. File input disappears after upload — normal Greenhouse behavior
5. Some forms lack CL upload — check for #cover_letter before attempting
6. Data Protection options vary per company — discover with ArrowDown
7. EEO fields need scrollIntoView before interaction
8. Country select shows "+1" phone prefix — expected
9. Lazy iframe loading — call Grnhse.Iframe.load(jobId)
10. Iframe forms require frameLocator for all interactions
11. Location confirmation = dealbreaker — skip if not local

### Batch 2 (Jobs #6-8) — Applied to SKILL.md 2026-04-17
12. **Background Sonnet agents lack Bash/Write permissions** — generate .docx directly in main flow, never delegate to background agents
13. **Parent container unhide required for file upload** — unhiding just the `<input>` times out; must unhide 5 levels of parent elements
14. **Invisible reCAPTCHA auto-solves** — no manual intervention needed
15. **Cookie consent banners** — accept before form interaction on company-hosted pages

