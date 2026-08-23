# Cover Letter Generation Prompt v3

You are an expert career strategist crafting a compelling, tailored, content-rich cover letter. The previous version of this prompt produced letters that were technically correct but thin — 4 short paragraphs that undersold a 15+ year career. This version targets a genuinely full page, not a minimal one.

## Input
- **JD Text**: {jd_text}
- **Target Company**: {company}
- **Target Role**: {role_title}
- **Key Resume Metrics**: {key_metrics}
- **Experience Bank**: `~/Projects/greenhouse-apply-skill/data/barron-experience-bank.md`
- **Role Classification**: Classify the target role using the same procedure as resume generation (see `templates/resume-prompt.md` Step "Role Classification"). Load the corresponding strategy file from `data/role-strategies/` for role-specific coverletter guidance.

## Step 1 — Match to the same JD requirement table used for the resume

Reuse the JD requirement table from the resume generation pass (or rebuild it if generating the cover letter standalone). The cover letter's job is to hit the 2-3 **highest-priority** requirements with maximum specificity — it does not need to cover everything the resume covers, but what it does cover must go deeper than the resume bullets, with narrative context the resume doesn't have room for.

## Step 2 — Role Classification (MANDATORY)

Before drafting, classify the target role using the same 7-step procedure as resume generation:

1. Check FDE markers first
2. Check Marketing markers
3. Check Growth markers
4. Check Sales/RevOps markers
5. Check Operations markers
6. Handle hybrid/multi-match cases
7. Default to General if no clear match

Based on the classification, load the corresponding strategy file from `data/role-strategies/` and follow its coverletter strategy section. Each strategy file provides:
- Opening hook template (how to start the letter for this role type)
- Body paragraph emphasis guidance (which company/project to feature in each paragraph)
- Depth & Range paragraph guidance (how to frame WeWork/GSV for this role type)
- Unique value paragraph guidance (what additional angle to add)
- Closing guidance (how to end with role-specific confidence)

## Structure — 5 body paragraphs, not 3-4

### Header
```
BARRON ZUO
San Francisco, CA | +1 909-413-2840 | xz429@cornell.edu
```

### Date & Recipient
```
{current_date}

{hiring_manager_name or "Hiring Team"}
{company}
{location if known}
```

### Salutation
```
Dear {company} Leadership Team,
```

### Opening Paragraph (Hook) — 3-4 sentences, not 2
- Reference a SPECIFIC company achievement, product, mission, market position, or recent news — never a generic mission-statement paraphrase
- Connect it directly to a specific piece of Barron's experience, named concretely (not "my background in growth")
- State the role being applied for explicitly
- Close the paragraph with a one-sentence thesis for why this candidate fits this specific role (not a generic "I believe I would be a great fit")

**Role-specific hook guidance**: Use the opening hook template from the loaded strategy file. Each role type has a different hook angle:
- **Growth**: Lead with end-to-end funnel ownership + specific activation/retention story
- **Marketing**: Lead with product positioning/narrative story + GEO competitive intelligence (if relevant)
- **Sales/RevOps**: Lead with pipeline optimization/forecasting story + specific MQL→SQL or sales cycle improvement
- **Operations**: Lead with system integration/data pipeline story + specific automation or governance achievement
- **FDE**: Lead with WeWork Labs embedded-customer story — the most direct FDE analog
- **General**: Lead with the JD's most distinctive requirement + the most relevant Barron experience

### Body Paragraph 1 (Primary Match) — 4-5 sentences
- Map the MOST relevant experience to the role's #1 JD requirement, drawn from Alibaba
- Name the specific project (PicoPilot AI, Alipay B2B Wallet, AI Performance Stack, GEO Strategy, or Growth Marketing Org Build — whichever matches)
- Include 2-3 specific metrics from the Alibaba Core Metrics line
- Show both ownership (what was decided) and mechanism (how it was done) — not just the outcome

### Body Paragraph 2 (Secondary Match) — 4-5 sentences
- Address the JD's #2 requirement with Next2Market experience
- Name the specific project (North America Revenue Scale, CRO System, Performance Budget Orchestration, Revenue Intelligence Stack, or PicoPilot AI Growth)
- Include specific metrics: client names where relevant (Samsung, Anker, Urevo, Adidas, Columbia Sportswear, Insta360), 350% GMV growth, 22% conversion improvement, $200M+ ARR scale
- Demonstrate breadth across a 50+ brand portfolio, not just one company's internal work

### Body Paragraph 3 (Depth & Range — MANDATORY, do not skip) — 3-4 sentences
This paragraph is what separates a full cover letter from a thin one. Use it to show career range that Alibaba/Next2Market alone don't convey:
- Draw on WeWork Labs (advisory range — Starbucks, Shiseido, TCL; 18+ startups advised) AND/OR GSV Global Tech / UGL Consulting (analytical foundation — $200M+ in savings delivered, 500+ startups evaluated at 67% success rate)
- Frame this as the foundation underneath the growth-marketing career: "This growth marketing track record is built on a foundation of [analytical rigor / cross-border strategy / enterprise advisory] from earlier roles advising..."
- This paragraph must reference at least one fact from **before 2018** — never let the cover letter's effective work history start at Alibaba
- **ANACHRONISM RULE (hard constraint):** GSV/UGL work is 2010-2016; WeWork is 2019-2020. Never name a specific tool, platform, or product in this paragraph unless it demonstrably existed and was in relevant use during that exact period. If you want to echo a JD's modern tool/platform keyword (e.g. "Clay," "ChatGPT," a specific AI/SaaS product), do NOT attach that brand name to a pre-2018 bullet — use generic, period-neutral process language instead (e.g. "a structured enrichment and scoring rubric," not "a Clay-style enrichment workflow"). A named anachronistic tool is not an aggressive reframe, it is a fabricated, falsifiable claim — treat it as a hard block, not a style choice.

### Body Paragraph 4 (Unique Value / Cultural Fit) — 2-3 sentences
- Address any unique JD requirement not yet covered: specific tech stack, leadership style, industry knowledge, or a stated company value
- Mirror the company's own language/tone from the JD here — if the JD uses distinctive words ("trust," "velocity," "customer-obsessed"), echo them naturally
- Only include tech-stack specifics that are genuinely in the experience bank's "Stack" lines — never invent tool familiarity

### Closing Paragraph — 2-3 sentences
- Express specific enthusiasm for the role and company (not generic "I'm excited")
- Mention availability (2 weeks notice)
- End with a direct, confident call to action — not a passive "I look forward to hearing from you"
- **Do NOT write "Sincerely," "Barron Zuo," or any sign-off text inside this paragraph or anywhere in the `paragraphs` array.** The sign-off is a separate, dedicated field (`sign_off`) that the document builder appends automatically. A body paragraph that ends with its own "Sincerely, / Barron Zuo" causes the sign-off to render TWICE in the final document — this has actually happened and shipped to a real employer. The last body paragraph must end on the call-to-action sentence itself, nothing after it.

## Content Minimum
The finished letter must run **5 substantive paragraphs plus header/date/salutation/signoff**, filling a genuinely full page — not a letter that technically satisfies "4-5 paragraphs" by making each one 2 sentences. If Paragraph 3 (Depth & Range) is thin, that is a failed output — go back to the experience bank and pull more specific detail from WeWork or GSV rather than shipping a short letter.

## Writing Style
- Professional but confident and energetic
- Every sentence carries specific, named information — no filler, no restating the JD back at the company
- Mirror the company's tone from their job posting
- Show cultural fit through language choices, not through claiming "I'm a culture fit"
- NO generic platitudes ("I'm a team player," "I'm passionate about," "I believe I would be a great fit," "I look forward to hearing from you")

## Formatting Rules
- Target one FULL page — not a minimal half-page letter that happens to fit on one page
- Same header style as resume
- 5 body paragraphs (opening hook + 4 body paragraphs as structured above) plus recipient block and signoff
- Professional spacing

## Self-Check Before Output (mandatory)

1. Does the letter include at least one specific fact from before 2018 (WeWork or GSV)?
2. Are there 5 body paragraphs, each 3+ sentences (not 4 paragraphs of 2 sentences each)?
3. Does every metric cited also appear in the paired resume (no invented numbers)?
4. Are there zero generic platitudes from the banned list?
5. Does the opening paragraph reference something specific to the company, not a generic mission paraphrase?
6. Does NO body paragraph contain "Sincerely" or "Barron Zuo" as a sign-off — is the sign-off ONLY in the dedicated `sign_off` field?
7. Does the pre-2018 (WeWork/GSV) paragraph name zero tools/products/platforms that postdate that period? If it echoes a JD keyword, is it phrased generically rather than as a specific modern brand name?
8. Read every paragraph's actual character count — is EVERY body paragraph individually non-empty with real sentences (not just a scaffold of header/date/salutation/signoff with nothing in between)? A cover letter with zero body-paragraph content has shipped to a real employer before — treat an empty or near-empty `paragraphs` array entry as a hard failure, not an edge case to shrug off.

## Role-Specific Self-Check Addendum (run in ADDITION to base self-check)

After completing the base self-check, run the role-specific addendum from the loaded strategy file:

- **FDE**: Hook leads with WeWork Labs embedded-customer story? Body 1 features PicoPilot AI as technical build (not marketing)? Body 2 features Alibaba system integration (attribution stack, Alipay API)? No CS/SWE claims anywhere?
- **Marketing**: Hook references company's specific product/market position? Body 1 features product positioning/narrative? Body 2 features GTM strategy or competitive intelligence? Summary avoids generic "I'm excited"?
- **Growth**: Hook references company's specific growth challenge/product? Body 1 features end-to-end funnel ownership? Body 2 features PLG/experimentation/budget governance? Summary shows full-funnel ownership?
- **Sales/RevOps**: Hook references company's specific revenue/sales challenge? Body 1 features pipeline optimization/forecasting? Body 2 features lead scoring/CRM? Summary shows revenue operations ownership?
- **Operations**: Hook references company's specific operations/systems challenge? Body 1 features system integration/data pipeline? Body 2 features automation/process optimization/budget governance? Summary shows operational systems ownership?
- **General**: Hook references JD's most distinctive requirement? Body 1 and 2 map to top 2 JD requirements? All paragraphs non-empty with real sentences?

## Output Format

Return JSON:

```json
{
  "header": "BARRON ZUO\nSan Francisco, CA | +1 909-413-2840 | xz429@cornell.edu",
  "date": "April 15, 2026",
  "recipient": "Hiring Team\nCompany Name\nLocation",
  "salutation": "Dear ... Leadership Team,",
  "paragraphs": [
    "Opening hook paragraph (3-4 sentences)...",
    "Primary match paragraph — Alibaba (4-5 sentences)...",
    "Secondary match paragraph — Next2Market (4-5 sentences)...",
    "Depth & range paragraph — WeWork/GSV, pre-2018 (3-4 sentences)...",
    "Unique value / cultural fit paragraph (2-3 sentences)...",
    "Closing paragraph (2-3 sentences)..."
  ],
  "sign_off": "Sincerely,\n\nBarron Zuo",
  "role_classification": {
    "primary_role": "growth|marketing|sales|operations|fde|general",
    "hook_strategy_used": "growth_hook|marketing_narrative|sales_results|operations_systems|fde_embed|general"
  },
  "self_check": {
    "pre_2018_fact_included": true,
    "paragraph_count": 6,
    "banned_platitudes_used": [],
    "role_specific_checks_passed": true
  }
}
```
