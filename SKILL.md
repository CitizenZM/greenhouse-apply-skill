---
name: greenhouse-job-application
description: Greenhouse.io job application automation. Three-phase design — Sonnet for setup + job queue, Sonnet for JD-tailored resume/CL generation + form fill + submit, Haiku for report. Naming convention: Greenhouse Job Application [MonthDDYYYY].
tags: [job-application, greenhouse, automation, playwright, resume, cover-letter]
---

# Greenhouse Job Application April152026

## Browser Control — PRIMARY METHOD (MANDATORY)

**Always use `mcp__playwright__*` tools** for all browser automation. Do NOT use `browser-harness` unless Playwright MCP is unavailable.

| Tier | Tool | Setup | Status |
|------|------|-------|--------|
| **PRIMARY** | `mcp__playwright__*` MCP tools | Zero — always connected via `npx @playwright/mcp@latest --headless` | ✅ Use this |
| SECONDARY | `browser-harness` Way 1 | Tick checkbox in chrome://inspect + click Allow popup | Only if Playwright MCP down |
| TERTIARY | `browser-harness` Way 2 | `chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-barron` + `BU_CDP_URL=http://127.0.0.1:9222` | Last resort |

**Why**: Playwright MCP Chrome runs via `--remote-debugging-pipe` (not port 9222). `browser-harness` scans port 9222 only — finds nothing — fails. Playwright MCP is always-connected and requires zero session setup. File upload uses `browser_run_code_unsafe` with `page.locator().setInputFiles()`.

## PRE-FLIGHT (run before EVERY session — MANDATORY)

```bash
# Kill any stale playwright-mcp processes from prior sessions (prevents page context drift)
pkill -f "playwright-mcp" 2>/dev/null; sleep 2; echo "Playwright processes cleared"
```

Do NOT kill the MCP server that is currently serving this session. Only run this before starting a new Claude Code session, not mid-session.

## CRITICAL BUG FIXES (field-tested 2026-05-29)

### Fix 1: File Upload — NEVER use `browser_file_upload`
`browser_file_upload` requires a native OS picker dialog to be open. Greenhouse uses a visually-hidden `input[type="file"]` — no dialog ever opens. This tool always fails with "modal state required".

**Correct method — always use `browser_run_code_unsafe` with setInputFiles:**
```javascript
// In browser_run_code_unsafe:
await page.bringToFront();
await page.locator('#resume').setInputFiles('$HOME/Downloads/resumeandcoverletter/Barron_Zuo_Company_Role_Resume.docx');
// For cover letter (separate input):
await page.locator('#cover_letter').setInputFiles('$HOME/Downloads/resumeandcoverletter/Barron_Zuo_Company_Role_Cover_Letter.docx');
```

### Fix 2: Page context — pin before every `browser_run_code_unsafe`
The `page` object in `browser_run_code_unsafe` binds to whichever tab Chrome considers active. With multiple tabs open, context drifts.

**Correct pattern — start every `browser_run_code_unsafe` block with:**
```javascript
await page.bringToFront();
await page.waitForLoadState('domcontentloaded');
// NOW do your work
```

### Fix 3: Never use `document` or `window` directly in `browser_run_code_unsafe`
`browser_run_code_unsafe` executes in **Node.js context** — `document` is not defined.
- ❌ WRONG: `document.querySelector('#first-name')`
- ✅ CORRECT: `await page.locator('#first-name').fill('Barron')`
- ✅ CORRECT: `await page.evaluate(() => document.querySelector('#first-name').value)`

### Fix 4: Location field — React autocomplete fails in headless mode
Google Places autocomplete blocks headless Chrome. Never rely on typing into the location field and waiting for suggestions.

**Correct method — inject via React fiber directly:**
```javascript
await page.bringToFront();
await page.evaluate(() => {
  const input = document.querySelector('#candidate-location');
  if (!input) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, 'San Francisco, CA');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
```

### Fix 5: Country/React Select dropdown — use scoped selector
`[role="option"]` matches 244 phone-country items AND the React Select. Always scope to the React Select container:
- ❌ WRONG: `page.locator('[role="option"]:has-text("United States")')`
- ✅ CORRECT: `page.locator('.select__option:has-text("United States")').first()`

### Fix 6: Greenhouse embeds form in cross-origin iframe
The application form at `boards.greenhouse.io` embeds a `job-boards.greenhouse.io` iframe. `browser_evaluate` runs in the main frame — it cannot see form elements inside the iframe.
- Use `page.locator()` and `page.fill()` inside `browser_run_code_unsafe` — these are frame-aware.
- Or use `page.frameLocator('iframe[src*="job-boards.greenhouse.io"]').locator('#first-name')` for explicit iframe targeting.

## Architecture

Three commands, two models:
- `/greenhouse-setup` (Sonnet) — login, search, filter, build job queue. Run once per session.
- `/greenhouse-apply` (Sonnet) — per-job loop: extract JD, generate tailored resume+CL, fill form, upload, submit.
- `/greenhouse-report` (Haiku) — generate Obsidian report from ledger.

JS scripts live in `~/.claude/skills/greenhouse-apply/scripts/`:
- `login.js` — navigate and login
- `search-jobs.js` — keyword search + salary filter
- `extract-job-list.js` — scrape job cards from results
- `extract-jd.js` — extract full JD from detail page
- `fill-application-form.js` — fill all form fields
- `upload-file.js` — remove existing file + prep input selector
- `submit-application.js` — submit + verify
- `next-job-page.js` — pagination

Python scripts:
- `generate-resume.py` — low-level .docx builder (takes pre-built JSON, writes file)
- `craft-resume.py` — **AI-powered resume CLI** (JD analysis → tailored JSON → .docx in one command)

## craft-resume CLI (PREFERRED — use this for all new applications)

`craft-resume` is the main resume generation command. It does JD deconstruction, experience remapping, keyword injection, project-level bullet expansion, and .docx output in one shot.

### Usage

```bash
# From JD URL (most common)
craft-resume --company Stripe --role "VP Growth Marketing" --jd-url "https://..."

# From JD file
craft-resume --company Verve --role "VP Marketing" --jd-file /tmp/jd.txt

# Inline JD text
craft-resume --company Komodo --role "VP Revenue Intelligence" --jd-text "$(pbpaste)"

# With Greenhouse job ID (auto-appends to ledger)
craft-resume --company Checkr --role "Sr Director Growth" --jd-url "..." --job-id 7940103

# Skip cover letter
craft-resume --company Acme --role "CMO" --jd-url "..." --no-cover-letter

# Preview last generated resume JSON
craft-resume --preview

# List recent output files
craft-resume --list

# Dry run (print JSON without writing .docx)
craft-resume --company X --role "Y" --jd-text "..." --dry-run
```

### What craft-resume does per application

1. **Phase 1 — JD Deconstruction**: Identifies North Star metric, extracts keyword matrix by category (tools, metrics, methodology, seniority signals), maps every requirement to experience bank
2. **Phase 2 — Title Adaptation**: Selects correct Alibaba and Next2Market title variant from experience bank's "Flexible Title Adaptations" based on role type
3. **Phase 3 — Project-Level Bullet Expansion**: Uses experience bank project names (PicoPilot AI, Alipay B2B Wallet Integration, CRO System — Shopify Plus, etc.) to write specific, mechanism-rich bullets with embedded project context
4. **Phase 4 — Keyword Injection**: Every JD requirement keyword embedded verbatim in a metric-driven bullet
5. **Phase 5 — DOCX Output**: Calls `generate-resume.py` to write final .docx to `~/Downloads/resumeandcoverletter/`
6. **Phase 6 — Ledger Entry**: Auto-appends to `Greenhouse-Application-Ledger.md`

### Files updated by craft-resume

| File | Purpose |
|---|---|
| `data/barron-experience-bank.md` | Source of truth for all facts, metrics, project names — UPDATE when new projects/metrics are confirmed |
| `templates/resume-prompt.md` | System prompt sent to Claude — update to refine generation quality |
| `scripts/craft-resume.py` | CLI entry point — update for new flags or JD parsing logic |
| `scripts/generate-resume.py` | Low-level .docx formatter — update for layout/style changes |

## Configuration

| Key | Value |
|-----|-------|
| BASE_URL | `https://my.greenhouse.io` |
| SEARCH_KEYWORDS | `["marketing", "growth"]` |
| MIN_SALARY | `160000` |
| FIRST_NAME | `Barron` |
| LAST_NAME | `Zuo` |
| LEGAL_FIRST_NAME | `Xiao` |
| EMAIL | `xz429@cornell.edu` |
| PHONE | `+1 9094132840` |
| LOCATION | `San Francisco` |
| LINKEDIN | `https://www.linkedin.com/in/barronz` |
| WEBSITE | `barronzuo.com` |
| CURRENT_COMPANY | `Alibaba INC` |
| AUTHORIZED | `YES` |
| SPONSORSHIP | `NO` |
| PREVIOUSLY_WORKED | `NO` |
| ONSITE_3DAYS | `YES` |
| RELOCATE | `YES` |
| SUBJECT_TO_AGREEMENT | `NO` |
| RECEIVE_UPDATES | `YES` |
| HEAR_ABOUT_US | `LinkedIn` |
| RECEIVE_COMMUNICATION | `YES` |
| GENDER | `Man` |
| GENDER_IDENTITY | `Straight` |
| RACE | `East Asian` |
| SEXUAL_ORIENTATION | `Asexual` |
| TRANSGENDER | `NO` |
| DISABILITY | `NO` |
| VETERAN | `NO` |
| RESUME_DIR | `~/Downloads/resumeandcoverletter/` |
| RESUME_TEMPLATE | `Barron_Zuo_Resume_Dialpad_HeadOfGrowth.docx` |
| OBSIDIAN_PATH | `$HOME/Documents/Obsidian/01-Projects/` |
| LEDGER_FILE | `Greenhouse-Application-Ledger.md` |

## DOM Selectors (to be mapped on first run)

```
LOGIN_EMAIL     = input[type="email"], input[name="email"], input[name="user[email]"]
LOGIN_PASSWORD  = input[type="password"], input[name="user[password]"]
LOGIN_SUBMIT    = button[type="submit"], input[type="submit"]
SEARCH_INPUT    = input[type="search"], input[placeholder*="Search"], input[name="query"]
JOB_CARDS       = .job-listing, .job-row, [data-testid="job-card"], .job-post
VIEW_JOB_BTN    = a:has-text("View"), button:has-text("View")
APPLY_BTN       = a:has-text("Apply"), button:has-text("Apply")
FORM_INPUTS     = form input, form select, form textarea
FILE_UPLOAD     = input[type="file"]
FILE_REMOVE     = button[aria-label="Remove"], .remove-file, button.remove, [title="Remove"]
SUBMIT_BTN      = button[type="submit"]:has-text("Submit"), button:has-text("Submit Application")
NEXT_PAGE       = [aria-label="Next"], .pagination-next, a:has-text("Next")
SALARY_FILTER   = [data-filter="salary"], select[name="salary"], input[name*="salary"]
```

## Resume Template Structure

Styles used: `Normal`, `Heading 1`, `List Bullet`
Margins: top=0.4", bottom=0.4", left=0.5", right=0.5"
Page width: 8.5"

Sections in order:
1. Name (Normal, bold, 16pt)
2. Contact line (Normal)
3. EXECUTIVE SUMMARY (Heading 1) + paragraph (Normal)
4. CORE COMPETENCIES (Heading 1) + table (2 cols x 4 rows)
5. PROFESSIONAL EXPERIENCE (Heading 1)
   - Company line (Normal) + Role line (Normal) + bullets (List Bullet)
   - Repeat for each role
6. EDUCATION (Heading 1) + bullets (List Bullet)

## Resume Generation Instructions (CRITICAL — UPDATED 2026-06-01)

### VALIDATED METHOD (use this for all applications going forward)

**Step 1 — Read JD fully, run Phase 1–4 analysis inline (per resume-prompt.md)**
**Step 2 — Build JSON content block matching the full resume-prompt.md spec**
**Step 3 — Call `generate-resume.py` with the JSON to produce .docx**
**Step 4 — Verify .docx word count and format before upload (see QA checklist below)**

```bash
# Generate resume
python3 ~/.claude/skills/greenhouse-apply/scripts/generate-resume.py \
  --type resume \
  --template "$HOME/Downloads/resumeandcoverletter/Barron_Zuo_BASE_CORRECTED_Resume.docx" \
  --content '<json>' \
  --output "$HOME/Downloads/resumeandcoverletter/Barron_Zuo_{Company}_{Role}_Resume.docx"

# Generate cover letter
python3 ~/.claude/skills/greenhouse-apply/scripts/generate-resume.py \
  --type cover_letter \
  --template "$HOME/Downloads/resumeandcoverletter/Barron_Zuo_BASE_CORRECTED_Resume.docx" \
  --content '<json>' \
  --output "$HOME/Downloads/resumeandcoverletter/Barron_Zuo_{Company}_{Role}_Cover_Letter.docx"
```

### QA Checklist — Run Before Every Upload (MANDATORY)

Extract text from the generated .docx and verify:

```python
import zipfile
from xml.etree import ElementTree as ET
def extract_text(path):
    with zipfile.ZipFile(path) as z:
        tree = ET.parse(z.open('word/document.xml'))
    texts = []
    for p in tree.getroot().iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
        t = ''.join(r.text or '' for r in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
        if t.strip(): texts.append(t)
    return texts
```

**Format checks (ALL must pass before upload):**
- [ ] WeWork location = "Singapore / Hong Kong" — NEVER Shenzhen or mainland China
- [ ] All 5 companies present: Alibaba, Next2Market, WeWork, Indiegogo, GSV
- [ ] Alibaba: 7–8 bullets, each 2–3 sentences
- [ ] Next2Market: 5–6 bullets, each 2–3 sentences
- [ ] WeWork: exactly 3 bullets (advisory tone)
- [ ] Indiegogo: 2–3 bullets (execution tone)
- [ ] GSV: 2–3 bullets (analytical tone)
- [ ] Executive summary: 5–6 sentences, 120+ words
- [ ] Core competencies: exactly 4 rows × 2 columns
- [ ] No negative framing — all bullets positive outcome-focused
- [ ] No invented metrics — all figures from experience-bank.md
- [ ] Word count: verify paragraphs ≥ 45 (proxy for 2-page density)

**Tone checks:**
- [ ] Zero negative expressions ("struggled", "difficult", "failed", "limited")
- [ ] Every bullet ends with a positive outcome or metric
- [ ] No hedging language ("tried to", "helped with", "attempted")

**ALWAYS use `craft-resume` CLI** — never generate resume content inline in Claude context.

```bash
# Step 1: Generate resume + cover letter
craft-resume \
  --company "CompanyName" \
  --role "Job Title" \
  --jd-url "https://job-board-url" \
  --job-id 1234567890

# Step 2: Verify files exist
ls -lh ~/Downloads/resumeandcoverletter/Barron_Zuo_CompanyName_*

# Step 3: Upload in application form (resume first, then cover letter)
```

**Why craft-resume instead of inline generation:**
- Reads full experience bank with project-level context (PicoPilot AI, CRO System, Alipay B2B Wallet, etc.)
- Adapts Alibaba/Next2Market titles per role type automatically — Alibaba ALWAYS "Head of ...", never "VP of ..."
- Injects JD keywords verbatim into metric-driven bullets
- Validates output JSON before writing .docx
- Auto-appends to ledger
- Enforces career progression arc: earlier roles (WeWork, Indiegogo, GSV) are calibrated to appropriate junior seniority — never inflate to compete with Alibaba/Next2Market scope

**Career Progression Rules (enforced by prompt + experience bank):**

| Role | Seniority | Bullets | Forbidden |
|------|-----------|---------|-----------|
| Alibaba | Head/VP — org builder, board reporting | 6–7 full depth | N/A |
| Next2Market | AVP/Director — portfolio P&L, C-suite advisory | 5–6 | N/A |
| WeWork | Director — consulting, advisory | 3 | Revenue scaling claims, org-building |
| Indiegogo | Director (execution) — GTM programs | 2–3 | Board reporting, enterprise P&L |
| GSV | Senior Manager — analytical, investment | 2–3 | Budget authority, team-building |

**Show resume before submitting** — always display full resume content to user for approval before proceeding to form upload and submission.

For EACH job application (legacy inline method — use craft-resume instead):

### Step 1: Deep JD Analysis
- Extract ALL requirements, highlighted capabilities, required experience, tech stack, leadership style, North Star metrics
- Identify every keyword and phrase that appears in "Requirements", "What you'll do", "What we're looking for" sections
- Map each requirement to a specific Barron experience that can be built/expanded to match

### Step 2: Resume Content Rules
1. **JD-to-Resume Translation (MANDATORY)**: Every requirement in the JD MUST be reflected in the resume. Build and expand Alibaba, Next2Market, Indiegogo experience with specific, detailed project examples that directly mirror JD requirements. Create partial career experience with strong relevancy to each requirement.
2. **Executive Summary**: MUST highlight the specific capabilities and experience the JD requires. Mirror the JD's language. Not generic — every summary must be different per job.
3. **Experience Expansion**: Expand Alibaba and Next2Market sections with MORE content associated with the specific JD. Add project details, initiative names, team sizes, systems built, processes created. Switch to product/growth/marketing focus as needed to match the role.
4. **Power verbs**: Orchestrated, Catalyzed, Engineered, Spearheaded, Architected
5. **Lead with metrics**: GMV, ROAS, CTR, conversion, ARR, retention rates — match the metrics language from the JD
6. **Resume length: EXACTLY 2 full pages** — professional margins, never sparse, never 1.5 pages. Fill with relevant, detailed content.
7. **Cover letter length: EXACTLY 1 full page** — dense, specific, every paragraph maps to a JD requirement.

### Step 3: Location & Education Rules (MANDATORY)
- **NO China locations**: Never mention Hangzhou, Shanghai, Beijing, or any Chinese city
- **NO Zhejiang University**: Replace undergraduate with "National University of Singapore — Bachelor of Arts in Economics (International)"
- Alibaba location: Use "San Francisco, CA" only (or "San Francisco, CA / Singapore" if APAC experience needed)
- All locations must be US or international (non-China)

### Step 4: Output
- Save as `.docx` to `RESUME_DIR` (`$HOME/Downloads/resumeandcoverletter/`)

## File Output Rules (MANDATORY)

All generated resume and cover letter files MUST be saved as `.docx` to the local directory before uploading:

| File | Naming Convention | Save Path |
|------|-------------------|-----------|
| Resume | `Barron_Zuo_{Company}_{JobTitle}_Resume.docx` | `$HOME/Downloads/resumeandcoverletter/` |
| Cover Letter | `Barron_Zuo_{Company}_{JobTitle}_Cover_Letter.docx` | `$HOME/Downloads/resumeandcoverletter/` |

- **Company**: PascalCase, no spaces (e.g., `Duolingo`, `ZoomInfo`, `SharkNinja`)
- **JobTitle**: PascalCase, abbreviated if long (e.g., `Growth_Marketing_Lead`, `VP_Marketing`, `Head_Perf_Marketing`)
- **NEVER upload directly from memory** — always write to disk first via `generate-resume.py`, then upload the saved file
- **Verify file exists** before uploading: `ls` the output path
- After submission, record the exact filenames in the ledger

## Dedup Ledger

File: `$HOME/Documents/Obsidian/01-Projects/Greenhouse-Application-Ledger.md`
Format: `company|job_title|job_id|YYYY-MM-DD|status|resume_file|cover_letter_file`

Read before applying. Append after each submission.

## Quality Rules

1. **MANDATORY JD analysis**: Always extract keywords and requirements BEFORE generating resume
2. **Salary gate**: Only apply to jobs with $160,000+ salary
3. **Dedup**: Never apply to same job twice — check ledger
4. **Resume quality**: Every bullet must have quantified impact and mirror JD keywords

## Token Rules

1. NEVER `browser_snapshot` except during first setup run for selector mapping
2. Use `browser_evaluate` for all DOM work
3. Read JS files from scripts/ on-demand — do NOT load all upfront
4. After each job: forget JD text and resume content, only retain ledger state
5. **CONTEXT REFRESH (MANDATORY)**: After every 2 job applications, STOP and tell the user to start a fresh `/greenhouse-apply` session. This prevents context bloat from accumulated JD text, resume content, and form interaction history. Output: "Context refresh needed. Run `/greenhouse-apply` to continue with next batch."
6. Process max 2 jobs per `/greenhouse-apply` invocation, then refresh

## Execution Mode (MANDATORY)

- **Fully autonomous**: Do NOT ask for permission at any step. All permissions are pre-granted.
- **No confirmation loops**: Execute every step (navigate, fill, upload, submit) without pausing.
- **Auto-recovery with Opus**: When stuck, blocked, or encountering an error that fails after 2 retries at Sonnet level, automatically switch to Opus model to diagnose and fix the issue, then switch back to Sonnet and continue the workflow.
- **Never stop for user input** unless CAPTCHA (hCaptcha/reCAPTCHA visual challenge) requires manual human interaction.
- **Security codes: FULLY AUTOMATIC** — Greenhouse sends 8-character codes to xz429@cornell.edu. Read them from Mail app autonomously. NEVER ask the user.

## Security Code Auto-Retrieval (MANDATORY)

When the Greenhouse security code screen appears (`security-input-0` through `security-input-7`), run this AppleScript immediately — no user prompt:

```bash
osascript << 'SCRIPT'
tell application "Mail"
  set theInbox to mailbox "INBOX" of account "xz429@cornell.edu"
  check for new mail in theInbox
  delay 2
  set msgs to (messages 1 through 5 of theInbox)
  repeat with m in msgs
    set f to sender of m
    set s to subject of m
    if f contains "greenhouse" then
      return content of m
    end if
  end repeat
  return "No code found"
end tell
SCRIPT
```

Parse the 8-character code (appears after "Copy and paste this code:"). Then:

1. **Clear existing inputs** — native setter to empty all 8 fields, dispatch `input` event
2. **Click `security-input-0`** to focus
3. **`pressSequentially`** the full 8-char code (auto-advances per char)
4. **Submit** immediately — `button[type="submit"]` click while not disabled
5. If "Incorrect" appears — re-run the AppleScript (new code was sent), clear fields, enter new code, resubmit

**Key behaviors:**
- Wake Mail first if needed: `osascript -e 'tell application "Mail" to get name of every account'` with a short bg timeout
- Account name is exactly `"xz429@cornell.edu"` 
- Run with `timeout 20000` to avoid hanging
- Do NOT interact with other form fields after entering the security code — it resets React state
- The Autofill button correctly sets phone/country in React state — use it before uploading files

## Cost-saving LLM mode (optional, opt-in)

For bulk runs (>5 jobs), use the `free-openrouter` adapter to avoid burning Anthropic credits on resume + cover-letter generation. Sonnet-quality output verified 2026-05-14 on Trinity Large Thinking (262K ctx, ~8s/call).

```python
import sys
sys.path.insert(0, '$HOME/.claude/skills/free-openrouter/adapters')
from greenhouse_adapter import generate_resume, generate_cover_letter

resume = generate_resume(jd_text=JD, company=COMPANY, role_title=ROLE)
cl = generate_cover_letter(jd_text=JD, company=COMPANY, role_title=ROLE,
                           key_metrics=resume.get('phase1_analysis'))
```

- **Per-job cost:** $0.00 (vs ~$0.06 Sonnet 4.6) — saves ~$1.80/mo at 5 jobs/day, ~$36/mo at 20 jobs/day
- **Daily ceiling:** 500 jobs/day (1,000 free reqs ÷ 2/job)
- **Throughput:** ~225 jobs/hour at 16s avg latency
- **Quality:** validated to produce JSON matching the same schema, with JD keywords embedded, real metrics from experience bank
- **Fallback:** if free models 429 the entire chain, adapter raises `GreenhouseAdapterError` — orchestrator catches and falls back to native Sonnet

## Error Recovery

| Error | Action |
|-------|--------|
| Login fails | Retry once, then auto-switch to Opus to debug |
| 0 search results | Try alternate keyword, report if still 0 |
| JD extraction empty | Fallback browser_snapshot once, if still empty switch to Opus |
| Form field not found | Try alternate selectors, log to unknowns, proceed |
| File upload fails | Retry with alternate selector, if fails switch to Opus |
| Submit validation error | Read error, fix fields, retry once, if fails switch to Opus |
| python-docx missing | `pip3 install python-docx`, retry |
| CAPTCHA/rate limit | STOP, flag for manual intervention (only exception) |
| browser-harness fails (port 9222) | Switch to mcp__playwright__* — this is the permanent primary method |
| Playwright MCP unavailable | Use browser-harness Way 2: launch Chrome with --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-barron, set BU_CDP_URL=http://127.0.0.1:9222 |
| Browser locked/stale | Kill MCP Chrome process, relaunch, continue |
| Dropdown not found | Try browser_run_code with Playwright API, if fails switch to Opus |
| Any 3+ consecutive failures | Auto-switch to Opus for deep diagnosis before continuing |
