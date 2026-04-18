---
name: greenhouse-job-application
description: Greenhouse.io job application automation. Optimized model-tiered design — Sonnet for all mechanical work (navigate, fill, upload, submit), Opus only for resume/CL content generation. Fully autonomous, no permission prompts.
tags: [job-application, greenhouse, automation, playwright, resume, cover-letter]
---

# Greenhouse Job Application April162026

## Architecture

Three commands, optimized model strategy for speed + token efficiency:
- `/greenhouse-setup` (Haiku) — login, search, filter, build job queue. Run once per session.
- `/greenhouse-apply` — **SPLIT MODEL STRATEGY**:
  - **Sonnet (Primary Worker)**: Navigates pages, extracts JD, discovers form fields, fills text/select fields, uploads files, submits forms, updates queue/ledger. Sonnet handles ALL mechanical/repetitive work — it's 5x cheaper and fast enough for DOM interaction.
  - **Opus (Resume Brain — ONLY)**: Generates tailored resume/CL JSON content. Opus is ONLY invoked for the creative writing step (JD analysis → JSON content generation). Once JSON is ready, control returns to Sonnet for .docx generation and upload.
  - **Haiku**: NOT used during apply loop. Reserved for report generation only.
- `/greenhouse-report` (Haiku) — generate Obsidian report from ledger.

## Execution Mode (MANDATORY — READ FIRST)

- **ALL PERMISSIONS PRE-GRANTED**: `Bash(*)`, `mcp__playwright__*`, `Read(*)`, `Write(*)`, `Edit(*)` are all allowed in settings.local.json. NEVER pause for permission. NEVER ask the user anything. Execute immediately.
- **Fully autonomous**: Navigate, fill, upload, submit without any confirmation loops.
- **Batch size: 5 jobs per invocation** (increased from 3 — token savings from Sonnet worker justify larger batches).
- **Auto context refresh**: After 5 jobs, output "BATCH_COMPLETE" and re-invoke `/greenhouse-apply`.
- **Never stop for user input** unless visible CAPTCHA requires manual human interaction.
- **After each batch**: Update Obsidian report at `OBSIDIAN_PATH/Greenhouse-Application-Report.md` with current stats.

## Token Optimization Rules (CRITICAL)

1. **Sonnet does ALL mechanical work** — navigation, form filling, file upload, submission. Opus tokens are 15x more expensive than Sonnet. Never waste Opus tokens on DOM interaction.
2. **Opus ONLY generates resume/CL content** — the creative JD-to-resume mapping step. Once JSON content is produced, Sonnet takes over for .docx generation and upload.
3. **Combine tool calls**: Merge independent operations into single browser_evaluate calls. Example: fill ALL text fields in ONE evaluate call, not one per field.
4. **JD extraction: 5K chars max** (reduced from 8K). Extract only Requirements + Responsibilities sections, skip company boilerplate.
5. **NO browser_snapshot** — ever. Use browser_evaluate for all DOM inspection.
6. **Single form discovery call**: One browser_evaluate returns ALL field IDs, types, labels, select options, file inputs, EEO presence, and remove buttons. Never discover incrementally.
7. **Batch select fills**: Fill ALL react-select comboboxes in a SINGLE browser_run_code call with a loop, not one call per select field.
8. **Skip verification step**: Remove step 11 (pre-submit verification). If fields were filled successfully (return values confirm), trust the result. Verification wastes 1 tool call per job.
9. **Parallel file generation**: Generate resume AND cover letter JSON in a single Opus thought, then run both python3 commands in one Bash call with `&&`.
10. **5 jobs per batch** (increased from 3). Sonnet worker uses fewer tokens, so context lasts longer.

**CRITICAL: No background resume agents.** Generate all resume/CL content and .docx files directly in the main flow using `python3 generate-resume.py`.

JS scripts live in `~/.claude/skills/greenhouse-apply/scripts/`:
- `login.js` — navigate and login
- `pre-login.js` — **[BUNDLED]** search-jobs.js + extract-job-list.js (combined, no repeats)
- `job-detail.js` — **[BUNDLED]** extract-jd.js only
- `form-prep.js` — **[BUNDLED]** upload-file.js (parameterized: FILE_TYPE='resume' or 'cover_letter')
- `fill-application-form.js` — fill all form fields
- `submit-application.js` — submit + verify
- `next-job-page.js` — pagination

Python scripts:
- `generate-resume.py` — template-based .docx generation via python-docx

## Configuration

| Key | Value |
|-----|-------|
| BASE_URL | `https://my.greenhouse.io` |
| SEARCH_KEYWORDS | `["marketing", "growth", "product marketing", "demand generation", "performance marketing", "partnerships", "brand marketing", "digital marketing", "content strategy"]` |
| MIN_SALARY | `160000` |
| FIRST_NAME | `Barron` |
| LAST_NAME | `Zuo` |
| LEGAL_FIRST_NAME | `Xiao` |
| EMAIL | `xz429@cornell.edu` |
| PHONE | `+1 9094132840` |
| LOCATION | `San Francisco` |
| LINKEDIN | `https://www.linkedin.com/in/barron-z-15226126a/` |
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
| GENDER | `Male` |
| HISPANIC_ETHNICITY | `No` |
| RACE | `Asian` |
| VETERAN_STATUS | `I am not a protected veteran` |
| DISABILITY_STATUS | `No, I do not have a disability and have not had one in the past` |
| RESUME_DIR | `/Users/barrom/Downloads/resumeandcoverletter/` |
| RESUME_TEMPLATE | `Barron_Zuo_Resume_Dialpad_HeadOfGrowth.docx` |
| OBSIDIAN_PATH | `/Users/barrom/Library/Mobile Documents/iCloud~md~obsidian/Documents/ObsidianVault/01-Projects/` |
| LEDGER_FILE | `Greenhouse-Application-Ledger.md` |

## DOM Selectors (Cached in SELECTORS_CACHE.json)

**First run**: Discover and cache all selectors in `~/.claude/skills/greenhouse-apply/data/SELECTORS_CACHE.json`

**Per-job workflow**: Load cache, skip selector discovery (saves 3-5K tokens per job)

Fallback selectors (if cache miss):
```
LOGIN_EMAIL     = input[type="email"], input[name="email"], input[name="user[email]"]
LOGIN_PASSWORD  = input[type="password"], input[name="user[password]"]
LOGIN_SUBMIT    = button[type="submit"], input[type="submit"]
SEARCH_INPUT    = input[type="search"], input[placeholder*="Search"], input[name="query"]
JOB_CARDS       = .job-listing, .job-row, [data-testid="job-card"], .job-post
APPLY_BTN       = a[href*="/apply"], button[aria-label*="Apply"], [class*="ApplyJob"]
FILE_UPLOAD     = input[type="file"]
FILE_REMOVE     = button[aria-label="Remove file"], button[aria-label="Remove"], .remove-file, button.remove, [title="Remove"]
SUBMIT_BTN      = button[type="submit"], [aria-label*="Submit"]
NEXT_PAGE       = [aria-label="Next"], [aria-label="Next page"], .pagination-next, [class*="next" i]
```

## Form Filling Patterns (Validated Across 8 Applications)

### Pattern 1: Text Fields — nativeInputValueSetter
```js
const fill = (id, val) => {
  const el = document.getElementById(id);
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
};
```
**NEVER use `browser_fill_form`** — it requires snapshot refs, not element IDs.

### Pattern 2: React-Select Comboboxes (via browser_run_code)
```js
const fillSelect = async (inputId, text, context) => {
  // context = page (direct) or frame (iframe)
  const input = context.locator(`#${inputId}`);
  await input.scrollIntoViewIfNeeded(); // REQUIRED — fields below fold won't open
  await input.click();
  await input.fill('');
  await input.pressSequentially(text, { delay: 50 });
  await page.waitForTimeout(600);
  const option = context.locator('[class*="select__option"]').filter({ hasText: text }).first();
  await option.click({ timeout: 3000 });
};
```
- If option not found after typing: use ArrowDown to reveal ALL options, then match
- Data Protection options vary per company (e.g. "Acknowledge/Confirm", not "agree")
- EEO decline options vary: "Decline To Self Identify", "I don't wish to answer", "I do not want to answer"

### Pattern 3: File Upload (with auto-resume removal + parent unhide)
```js
// Step 1: Remove auto-attached MyGreenhouse profile resume (if present)
const removeBtn = context.locator('[aria-label="Remove file"]').first();
if (await removeBtn.count() > 0) await removeBtn.click();

// Step 2: Unhide ALL file inputs AND their parent containers (5 levels)
await context.evaluate(() => {
  document.querySelectorAll('input[type="file"]').forEach(fi => {
    fi.style.display = 'block';
    fi.style.visibility = 'visible';
    fi.style.opacity = '1';
    fi.style.height = '40px';
    fi.style.width = '300px';
    fi.style.position = 'relative';
    fi.style.zIndex = '9999';
    let parent = fi.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      parent.style.display = 'block';
      parent.style.visibility = 'visible';
      parent.style.opacity = '1';
      parent.style.overflow = 'visible';
      parent = parent.parentElement;
    }
  });
});

// Step 3: Upload using first available file input (resume first, then CL)
await context.locator('input[type="file"]').first().setInputFiles('/path/to/resume.docx');
// After resume upload, file input is consumed by DOM
// Re-run unhide for cover_letter, then upload to remaining file input
```
**CRITICAL**: Unhiding just the `<input>` is insufficient. Parent containers (up to 5 levels) must also be unhidden. This was discovered on Obsidian Security (Job #8) where `#resume` by ID timed out but `input[type="file"]` with parent unhide worked.

### Pattern 4: Iframe Detection and Handling
```js
// Check for Greenhouse iframe embed
const grnhseApp = document.getElementById('grnhse_app');
const grnhseIframe = document.getElementById('grnhse_iframe');
const hasGrnhse = typeof window.Grnhse !== 'undefined';

// If grnhse_app exists but empty → invoke manual load
if (hasGrnhse && grnhseApp && !grnhseIframe) {
  Grnhse.Iframe.load(jobId);
}

// ALL form interactions must use frameLocator for iframe forms
const context = grnhseIframe ? page.frameLocator('#grnhse_iframe') : page;
```
Three form types encountered:
1. **Direct Greenhouse page** (job-boards.greenhouse.io) — use `page` directly
2. **Company site with loaded iframe** — use `page.frameLocator('#grnhse_iframe')`
3. **Company site with lazy iframe** — call `Grnhse.Iframe.load(jobId)` first, then frameLocator

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

## Resume Generation Instructions (CRITICAL)

**Model**: Always use Sonnet for resume and cover letter drafting and format layout design.

For EACH job application, generate tailored resume and cover letter:

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
- Save as `.docx` to `RESUME_DIR` (`/Users/barrom/Downloads/resumeandcoverletter/`)

## File Output Rules (MANDATORY)

All generated resume and cover letter files MUST be saved as `.docx` to the local directory before uploading:

| File | Naming Convention | Save Path |
|------|-------------------|-----------|
| Resume | `Barron_Zuo_{Company}_{JobTitle}_Resume.docx` | `/Users/barrom/Downloads/resumeandcoverletter/` |
| Cover Letter | `Barron_Zuo_{Company}_{JobTitle}_Cover_Letter.docx` | `/Users/barrom/Downloads/resumeandcoverletter/` |

- **Company**: PascalCase, no spaces (e.g., `Duolingo`, `ZoomInfo`, `SharkNinja`)
- **JobTitle**: PascalCase, abbreviated if long (e.g., `Growth_Marketing_Lead`, `VP_Marketing`, `Head_Perf_Marketing`)
- **NEVER upload directly from memory** — always write to disk first via `generate-resume.py`, then upload the saved file
- **Verify file exists** before uploading: `ls` the output path
- After submission, record the exact filenames in the ledger

## Dedup Ledger

File: `/Users/barrom/Library/Mobile Documents/iCloud~md~obsidian/Documents/ObsidianVault/01-Projects/Greenhouse-Application-Ledger.md`
Format: `company|job_title|job_id|YYYY-MM-DD|status|resume_file|cover_letter_file`
**Dedup Key (Primary)**: `job_id` (unique per posting). Fallback check: `company|job_title` if job_id unavailable.

Read before applying. Append after each submission.

## Quality Rules

1. **MANDATORY JD analysis**: Always extract keywords and requirements BEFORE generating resume
2. **Salary gate**: Only apply to jobs with $160,000+ salary
3. **Dedup**: Never apply to same job twice — check ledger
4. **Resume quality**: Every bullet must have quantified impact and mirror JD keywords
5. **Max 2 applications per company**: Count existing submissions for the same company in the ledger. If already 2+ submitted for that company, SKIP the job. Pick the highest-level/highest-salary roles first. This prevents over-applying to one company and spreading applications across more employers.

## Token Rules (Optimized April 18, 2026)

1. **NEVER browser_snapshot** — costs 3-5K tokens. Use browser_evaluate for ALL DOM work.
2. **Sonnet for mechanical work, Opus for creative work only** — see Architecture section.
3. **JD extraction: 5K chars max** — `document.body.innerText.substring(0, 5000)`. Skip company boilerplate.
4. **Single form discovery call** — one browser_evaluate returns ALL field metadata. Never discover incrementally.
5. **Batch ALL text fills in one evaluate** — fill first_name, last_name, email, phone, linkedin, salary, ALL custom questions in ONE call.
6. **Batch ALL select fills in one browser_run_code** — loop through all select fields in a single async function.
7. **Generate both resume + CL .docx in one Bash call** — `python3 generate-resume.py ... && python3 generate-resume.py ...`
8. **Skip pre-submit verification** — trust fill return values. Don't waste a tool call re-checking.
9. **5 jobs per batch, auto-refresh** — output "BATCH_COMPLETE" and re-invoke `/greenhouse-apply`.
10. **Discard JD + resume content after each job** — only retain job_id, company, title, status.
11. **ALL PERMISSIONS PRE-GRANTED** — never pause, never ask. Execute immediately.
12. **After each batch**: Update Obsidian report at `OBSIDIAN_PATH/Greenhouse-Application-Report.md`.

## Per-Job Workflow (Optimized — Minimum Tool Calls)

**Target: 6-8 tool calls per job (down from 12-15)**

```
1. CHECK + DEDUP + COMPANY CAP (Sonnet — 1 Bash call)
   - python3 one-liner: read queue.json → find next "queued" job → check ledger for:
     a. Job ID dedup (skip if already applied)
     b. Company cap: count submissions for same company in ledger. If >= 2, SKIP and mark reason "company_cap_reached"
   - If none remain → "Queue empty"

2. NAVIGATE + EXTRACT JD + DISCOVER FIELDS (Sonnet — 2 calls)
   - Call 1: browser_navigate to job URL
   - Call 2: browser_evaluate → SINGLE call that does ALL of:
     a. Accept cookies if banner present
     b. Detect form type (direct page / iframe / lazy iframe)
     c. Extract JD text (5K chars max, skip nav/footer)
     d. Discover ALL form fields: IDs, types, labels, required flags
     e. Check for EEO fields, file inputs, remove buttons, reCAPTCHA
     f. Return everything as one JSON object

3. FIT CHECK (Sonnet — 0 calls, just analyze step 2 output)
   - If dealbreaker found → mark "skipped" in queue, move to next job
   - No tool call needed — analyze the JD text from step 2

4. FILL ALL TEXT FIELDS (Sonnet — 1 browser_evaluate call)
   - ONE call fills ALL text fields: first_name, last_name, email, phone, linkedin, website, salary, ALL custom question_* fields
   - Return success/failure map

5. FILL ALL SELECT FIELDS (Sonnet — 1 browser_run_code call)
   - ONE async function that loops through ALL select/combobox fields:
     country, authorization, sponsorship, relocation, EEO fields, custom selects
   - scrollIntoViewIfNeeded + pressSequentially + option click for each
   - Return results map

6. GENERATE RESUME + CL (Opus — content generation + 1 Bash call)
   - Opus analyzes JD → produces resume JSON + CL JSON
   - ONE Bash call: write both JSONs to /tmp AND run both generate-resume.py commands
   - `echo '<resume_json>' > /tmp/r.json && echo '<cl_json>' > /tmp/cl.json && cd scripts/ && python3 generate-resume.py --type resume ... && python3 generate-resume.py --type cover_letter ...`

7. UPLOAD + SUBMIT (Sonnet — 1 browser_run_code call)
   - ONE async function that does ALL of:
     a. Remove auto-attached resume if present
     b. Unhide file inputs + 8 levels of parents
     c. Upload resume via first input[type="file"]
     d. Wait 1s, re-unhide, upload CL via next input[type="file"] (if available)
     e. Click submit button
     f. Wait 4s, check for confirmation URL/text
   - Return: { uploaded: true, submitted: true, confirmation: "..." }

8. RECORD (Sonnet — 1 Bash call)
   - ONE python3 one-liner: update queue.json status + append to ledger + update Obsidian report
```

**TOTAL: 6-8 tool calls per job (was 12-15). Saves ~40% token overhead.**

## Model Switching Protocol

| Step | Model | Why |
|------|-------|-----|
| 1. Queue check | Sonnet | Mechanical — read JSON |
| 2. Navigate + extract | Sonnet | DOM interaction |
| 3. Fit check | Sonnet | Text analysis (simple) |
| 4. Fill text fields | Sonnet | DOM interaction |
| 5. Fill select fields | Sonnet | DOM interaction |
| 6. Generate resume/CL | **Opus** | Creative writing — JD analysis + tailored content |
| 7. Upload + submit | Sonnet | DOM interaction |
| 8. Record | Sonnet | File I/O |

**Opus is used for exactly 1 step per job.** Everything else is Sonnet.
When running as Opus supervisor, steps 1-5 and 7-8 should be executed with minimal reasoning — just run the tool calls. Save deep thinking for step 6 only.

## Error Recovery (Updated After 8 Applications)

| Error | Action |
|-------|--------|
| Login fails | Retry once, then auto-switch to Opus to debug |
| 0 search results | Try alternate keyword, report if still 0 |
| JD extraction empty | Try `document.body.innerText` directly. If iframe, extract from frameLocator body |
| Form field not found | Try alternate selectors, log to unknowns, proceed |
| File upload `#resume` times out | Unhide ALL `input[type="file"]` + 5 levels of parent containers, then use `.first()` selector |
| File input consumed after upload | Expected behavior — Greenhouse removes input from DOM. Re-run unhide for next upload |
| Auto-attached MyGreenhouse resume | Check for `[aria-label="Remove file"]` before uploading. Click to remove, then upload tailored version |
| React-select option not found | Don't assume option text. Use ArrowDown to reveal all options first, then match actual text |
| EEO dropdown won't open | `scrollIntoViewIfNeeded()` REQUIRED before clicking — fields are below fold |
| Submit validation error | Read error, fix fields, retry once |
| python-docx missing | `pip3 install python-docx`, retry |
| Visible CAPTCHA | STOP, flag for manual intervention (only exception). Invisible reCAPTCHA auto-solves |
| Iframe not loading | Check for `Grnhse` global → call `Grnhse.Iframe.load(jobId)`. If no Grnhse global, iframe already loaded |
| Cookie banner blocking | Accept via `text="Accept All Cookies"` click before form interaction |
| Background agent permission-blocked | Generate resume/CL directly in main flow — never rely on background agents for file I/O |
| Any 3+ consecutive failures | Auto-switch to Opus for deep diagnosis before continuing |

## Supervisor Optimization Cycle

Every 5 completed applications:
1. Review all optimization notes in supervisor-log.md
2. Apply learnings to this SKILL.md (form patterns, error handling, new field types)
3. Record optimization timestamp
4. Reset optimization note counter

Last optimization: 2026-04-17 (after jobs #6-8: Eve, Revolution Medicines, Obsidian Security)

## Optimization Log (Cumulative — 8 Applications)

1. **browser_fill_form requires snapshot refs** — never use it. Use nativeInputValueSetter for text, pressSequentially for selects.
2. **MyGreenhouse auto-attaches profile resume** — always check and remove before uploading tailored resume.
3. **Country field is react-select** — requires pressSequentially + option click, not evaluate-based value setting.
4. **File input disappears after upload** — Greenhouse removes from DOM. Normal behavior.
5. **Some forms lack cover letter upload** — check for #cover_letter input before attempting CL upload.
6. **Data Protection options vary per company** — don't hardcode "agree". Discover options with ArrowDown first.
7. **EEO fields need scrollIntoView** — veteran_status and disability_status are below fold. Must scroll before interaction.
8. **Country select shows phone prefix** — "+1" for United States is expected (phone code format).
9. **Lazy iframe loading** — `Grnhse.Iframe.load(jobId)` required when grnhse_app div is empty.
10. **Iframe forms require frameLocator** — all interactions must go through `page.frameLocator('#grnhse_iframe')`.
11. **Location confirmation = dealbreaker** — skip if candidate isn't local to required office.
12. **Background Sonnet agents lack permissions** — always generate .docx files in main Opus flow. Never delegate file I/O to background agents.
13. **Parent container unhide required for file upload** — unhiding just the `<input>` is insufficient. Must unhide 5 levels of parent elements for setInputFiles to work reliably.
14. **Invisible reCAPTCHA auto-solves** — no manual intervention needed. Only visible CAPTCHA requires user action.
15. **Cookie consent banners** — accept before form interaction on company-hosted pages. Direct Greenhouse pages don't have cookie banners.
