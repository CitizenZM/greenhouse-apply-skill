#!/usr/bin/env python3
"""
craft-resume — AI-powered resume and cover letter generator for Barron Zuo.

Usage:
  craft-resume --jd "path/to/jd.txt"         # From file
  craft-resume --jd-url "https://..."          # From URL
  craft-resume --company Acme --role "VP Marketing" --jd-text "..."  # Inline
  craft-resume --company Acme --role "VP Marketing" --jd-file /tmp/jd.txt
  craft-resume --preview                       # Show last generated resume content
  craft-resume --list                          # List all generated resumes

Options:
  --company NAME       Company name (PascalCase for filename)
  --role TITLE         Job title (used for filename and tailoring)
  --jd-file PATH       Path to JD text file
  --jd-text TEXT       JD text inline (wrap in quotes)
  --jd-url URL         URL to fetch JD from (uses requests)
  --output-dir DIR     Output directory (default: ~/Downloads/resumeandcoverletter/)
  --no-cover-letter    Skip cover letter generation
  --model MODEL        Claude model (default: claude-sonnet-4-6)
  --preview            Print last resume JSON to stdout
  --list               List recent resumes in output dir
  --dry-run            Print generated JSON without creating .docx
"""

import argparse
import json
import os
import sys
import subprocess
import re
from datetime import date
from pathlib import Path

# Paths
SKILL_DIR = Path.home() / "Projects/greenhouse-apply-skill"
EXPERIENCE_BANK = SKILL_DIR / "data/barron-experience-bank.md"
RESUME_PROMPT = SKILL_DIR / "templates/resume-prompt.md"
COVER_LETTER_PROMPT = SKILL_DIR / "templates/cover-letter-prompt.md"
GENERATE_SCRIPT = SKILL_DIR / "scripts/generate-resume.py"
TEMPLATE_DOCX = SKILL_DIR / "templates/blank-base-template.docx"
OUTPUT_DIR = Path.home() / "Downloads/resumeandcoverletter"
LEDGER = Path.home() / "Documents/Obsidian/01-Projects/Greenhouse-Application-Ledger.md"
CACHE_FILE = Path("/tmp/craft-resume-last.json")

DEFAULT_MODEL = "claude-sonnet-4-6"


def fetch_jd_from_url(url: str) -> str:
    try:
        import urllib.request
        from html.parser import HTMLParser

        class TextExtractor(HTMLParser):
            def __init__(self):
                super().__init__()
                self.text = []
                self.skip = False
            def handle_starttag(self, tag, attrs):
                if tag in ('script', 'style', 'nav', 'header', 'footer'):
                    self.skip = True
            def handle_endtag(self, tag):
                if tag in ('script', 'style', 'nav', 'header', 'footer'):
                    self.skip = False
            def handle_data(self, data):
                if not self.skip and data.strip():
                    self.text.append(data.strip())

        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
        parser = TextExtractor()
        parser.feed(html)
        return '\n'.join(parser.text)
    except Exception as e:
        print(f"[craft-resume] Warning: URL fetch failed ({e}). Paste JD text manually.", file=sys.stderr)
        sys.exit(1)


def call_claude(prompt: str, model: str = DEFAULT_MODEL) -> str:
    """Call Claude via anthropic SDK, falling back to claude CLI if no API key."""
    # Try SDK first if API key is available
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if api_key:
        return call_claude_sdk(prompt, model)
    # Fall back to claude CLI (available in Claude Code environment)
    return call_claude_cli(prompt, model)


def call_claude_cli(prompt: str, model: str = DEFAULT_MODEL) -> str:
    """Call Claude via the claude CLI subprocess (works inside Claude Code)."""
    import shutil
    claude_bin = shutil.which("claude") or "$HOME/.local/bin/claude"
    if not os.path.exists(claude_bin):
        print("[craft-resume] ERROR: claude CLI not found.", file=sys.stderr)
        sys.exit(1)
    # Use --print with stdin input; add system prompt to enforce JSON-only output
    json_prompt = (
        "CRITICAL INSTRUCTION: You MUST respond with ONLY a valid JSON object. "
        "No prose, no markdown, no explanation, no preamble, no code fences. "
        "Output ONLY the raw JSON object starting with { and ending with }.\n\n"
        + prompt
    )
    result = subprocess.run(
        [claude_bin, "--print", "--model", model, "--output-format", "text"],
        input=json_prompt, capture_output=True, text=True, timeout=300
    )
    if result.returncode != 0:
        print(f"[craft-resume] ERROR: claude CLI failed: {result.stderr[:500]}", file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def call_claude_sdk(prompt: str, model: str = DEFAULT_MODEL) -> str:
    """Call Claude via anthropic SDK."""
    try:
        import anthropic
        client = anthropic.Anthropic()
        msg = client.messages.create(
            model=model,
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    except ImportError:
        print("[craft-resume] ERROR: Neither 'claude' CLI nor 'anthropic' package available.", file=sys.stderr)
        print("Install: pip install anthropic  OR  use claude CLI", file=sys.stderr)
        sys.exit(1)


def extract_json_from_response(text: str) -> dict:
    """Extract JSON block from Claude response, handling markdown code fences."""
    # Try raw JSON first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from ```json ... ```
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Try finding first { ... } block
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not extract JSON from response. First 500 chars:\n{text[:500]}")


def build_resume_prompt(jd_text: str, company: str, role: str) -> str:
    bank = EXPERIENCE_BANK.read_text()
    template = RESUME_PROMPT.read_text() if RESUME_PROMPT.exists() else ""
    
    return f"""You are an elite executive resume writer and ATS specialist. Generate a deeply tailored, project-rich 2-page resume for Barron Zuo.

## JOB DESCRIPTION
Company: {company}
Role: {role}

{jd_text}

## EXPERIENCE BANK (Source of Truth — use project details to expand bullets)
{bank}

## GENERATION RULES

### Phase 1: JD Analysis (do this mentally before writing)
- Identify North Star metric (the single outcome this hire is accountable for)
- Extract ALL keywords from Requirements, Responsibilities, "What you'll do" sections
- Map every requirement to the best matching experience using the KEYWORD → EXPERIENCE MAPPING table
- Mark gaps: if a requirement has no experience match, minimize resume exposure to it

### Phase 2: Content Generation Rules

**Executive Summary** (4 sentences, NEVER generic):
- S1: Lead with the JD's North Star + Barron's strongest matching metric
- S2: Cite scale from Alibaba ($180M ARR or 5M users or 8-figure budget) tied to JD's primary scope
- S3: Name the specific methodology the JD emphasizes (PLG, ABM, RevOps, etc.) with proof metric
- S4: Signal fit with the company's product stage, industry, or mission

**Title Adaptation** (MANDATORY):
- Adapt Alibaba and Next2Market job titles using the "Flexible Title Adaptations" in the experience bank
- NEVER change the company name, date range, or location
- Alibaba title MUST always start with "Head of ..." — NEVER "VP of ..." (Barron held a Head-level title)
- Next2Market title starts with "AVP, ..." — the sub-title adapts to the role type

**Career Progression Calibration** (CRITICAL — enforced every generation):
The resume must reflect a realistic career arc where earlier roles are appropriately junior.

| Role | Seniority Ceiling | Bullet Tone | Count | FORBIDDEN |
|------|-------------------|-------------|-------|-----------|
| Alibaba | Head/VP — org builder, board reporting, full budget authority | Strategic + execution depth | 6–7 | N/A |
| Next2Market | AVP/Director — portfolio P&L, C-suite advisory | Portfolio scale, client executive relationships | 5–6 | N/A |
| WeWork | Director — advisory, consulting | "Advised", "consulted", "designed systems for" | 3 | "Scaled revenue X→Y", org P&L ownership |
| Indiegogo | Director (execution) — programs, GTM | "Led", "managed", "partnered with CEO" | 2–3 | Board reporting, enterprise budget authority |
| GSV | Senior Manager — analytical, investment advisory | "Delivered", "evaluated", "facilitated", "conducted" | 2–3 | Budget authority, team-building, revenue claims |

Alibaba and Next2Market carry ~70% of relevance weight. WeWork, Indiegogo, GSV are context-setters — calibrate depth so they support without competing in scope.

**Bullet Depth Rules** (CRITICAL — this is the core requirement):
- Every bullet = [Power Verb] + [Specific Project Name] + [Mechanism/How] + [Quantified Outcome] + [JD keyword embedded]
- Reference PROJECT names from the experience bank (e.g., "PicoPilot AI", "Alipay B2B Wallet Integration", "CRO System — Shopify Plus")
- Add mechanism detail: HOW it was done (tool used, system built, team coordinated, data model applied)
- Alibaba: 6-7 bullets — must cover AI, performance/paid, analytics, retention/lifecycle, growth loop, leadership, and 1 JD-specific
- Next2Market: 5-6 bullets — cover CRO/experimentation, revenue/pipeline, martech stack, client scale, and 1 JD-specific
- WeWork: 3 bullets — advisory/consulting angle, enterprise transformation, forecasting
- Indiegogo: 2-3 bullets — lead with 44% pipeline surge, add AI personalization and channel diversification
- GSV: 2-3 bullets — financial optimization ($200M), accelerator (500+ startups), market entry/M&A

**Keyword Injection** (non-negotiable):
- Every keyword from the JD Requirements section must appear at least once in resume bullets
- Use JD's EXACT phrasing — if JD says "CAC payback" use "CAC payback" not "customer acquisition cost recovery"
- Embed keywords inside metric-driven bullets — never in a standalone skills list

**Competencies** (8 items in 2×4 table):
- Derive directly from JD keyword matrix — use JD's exact language where possible
- Each item: 3-6 words, specific (not "Marketing Strategy" → "Growth Loop Architecture & PLG Systems")

### Phase 3: Forbidden Patterns
- NO "responsible for" — use action verb + outcome
- NO vague scope — always add project name, team size, or dollar figure
- NO unquantified bullets — every bullet must end with a measurable result
- NO recycled summary — must be fresh for this specific company/role
- NO fabricated metrics — only use numbers from the experience bank above
- NO dates, company names, or locations changed from experience bank

### Output Format
Return ONLY valid JSON. No prose before or after. No markdown fences. Pure JSON object.

{{
  "name": "BARRON ZUO",
  "contact": "San Francisco, CA | +1 909-413-2840 | xz429@cornell.edu | linkedin.com/in/barronz | barronzuo.com",
  "executive_summary": "...",
  "competencies": [
    ["Left Competency 1", "Right Competency 1"],
    ["Left Competency 2", "Right Competency 2"],
    ["Left Competency 3", "Right Competency 3"],
    ["Left Competency 4", "Right Competency 4"]
  ],
  "experience": [
    {{
      "company": "Alibaba Group (AliExpress US / Alipay) | Pasadena, CA / Remote",
      "role": "[ADAPTED TITLE BASED ON ROLE TYPE] | 2022 – Present",
      "bullets": ["Architected [Project Name]...", "Engineered...", "Spearheaded...", "Built...", "Drove...", "Orchestrated..."]
    }},
    {{
      "company": "Next2Market Consulting & Accelerator | Sunnyvale, CA",
      "role": "[ADAPTED TITLE] | 2020 – 2022",
      "bullets": ["Rebuilt [Project Name]...", "Deployed...", "Managed...", "Architected...", "Established..."]
    }},
    {{
      "company": "WeWork Labs | Shenzhen, China",
      "role": "Director, Digital Transformation & Growth Strategy | 2019 – 2020",
      "bullets": ["Advised 18+ high-growth startups...", "Consulted Starbucks...", "Built..."]
    }},
    {{
      "company": "Indiegogo Inc. | San Jose, CA",
      "role": "Director, Strategic Programs & GTM Strategy | 2018 – 2019",
      "bullets": ["Catalyzed 44% surge...", "Architected AI recommendation engine...", "Managed..."]
    }},
    {{
      "company": "GSV Global Tech / UGL Consulting | Global",
      "role": "Senior Investment Manager / Management Consultant | 2010 – 2016",
      "bullets": ["Delivered $200M+...", "Evaluated 500+ startups...", "Conducted..."]
    }}
  ],
  "education": [
    "Cornell University, Johnson Graduate School of Management — MBA, Digital Technology Focus",
    "National University of Singapore (NUS) — B.Eng Industrial System Engineering (Full Scholarship)"
  ],
  "meta": {{
    "company": "{company}",
    "role": "{role}",
    "north_star_metric": "...",
    "top_keywords_covered": ["kw1", "kw2", "kw3"],
    "title_adaptations": {{
      "alibaba": "...",
      "next2market": "..."
    }}
  }}
}}"""


def build_cover_letter_prompt(jd_text: str, company: str, role: str, resume_meta: dict) -> str:
    bank = EXPERIENCE_BANK.read_text()
    north_star = resume_meta.get("meta", {}).get("north_star_metric", "")
    keywords = resume_meta.get("meta", {}).get("top_keywords_covered", [])
    from datetime import date
    today = date.today().strftime("%B %d, %Y")

    return f"""Write a 1-page executive cover letter for Barron Zuo applying to {company} for the {role} role.

## JD
{jd_text}

## Context from Resume Analysis
North Star Metric: {north_star}
Top Keywords: {', '.join(keywords)}

## Experience Bank (source of all facts and metrics)
{bank}

## Cover Letter Rules
- EXACTLY 4 dense paragraphs — no filler, every sentence carries a metric or specific detail
- Para 1 (Hook — 5-7 sentences, ~120 words): Name something SPECIFIC about {company}'s mission/product/stage/recent news + Barron's single most directly relevant achievement with a metric. Establish the strategic analogy between what {company} needs and what Barron has done. End with a declarative fit statement ("This is the exact mandate I have executed at scale" — NOT "I believe I would be a great fit").
- Para 2 (Primary match — 6-8 sentences, ~160 words): Map Alibaba experience in DEEP detail — cite PicoPilot AI by name, $180M ARR, AI Performance Stack, $12M budget, specific channels, CAC payback %, pipeline-to-close %, GEO strategy, org scale 3→10+ pods. Map EACH detail to the JD's top 2 requirements explicitly. This paragraph should feel like a case study, not a summary.
- Para 3 (Secondary match — 6-8 sentences, ~160 words): Map Next2Market experience in DEEP detail — cite $50M→$200M ARR in 18 months, CRO System Shopify Plus (name it), 200+ A/B tests, 18% CVR lift, $7M+/month budget, Rockerbox + Salesforce attribution, MQL→SQL 30% improvement, sales cycle 47→31 days. Map each to JD's next 1-2 requirements. Include board-level reporting experience.
- Para 4 (Close — 5-6 sentences, ~120 words): Name the specific role at {company}. State concretely what Barron would do in the first 90 days tied to the JD's stated priorities (not generic). End with a direct, confident call to action — something like "I'd welcome the chance to walk through how this translates to {company}'s specific growth targets." NEVER: "I look forward to hearing from you", "Thank you for your consideration", "excited to apply".
- Embed JD keywords naturally — minimum 8 JD keywords woven across all paragraphs
- Never: "I am passionate about", "team player", "I am excited to apply", two consecutive sentences starting with "I", vague claims without metrics
- Total length: 550–650 words filling a complete dense page. If under 500 words, expand paragraphs 2 and 3.

## Output Format
Return ONLY valid JSON. No markdown fences. Pure JSON object.

{{
  "header": "BARRON ZUO\\nSan Francisco, CA | +1 909-413-2840 | xz429@cornell.edu | linkedin.com/in/barronz | barronzuo.com",
  "date": "{today}",
  "recipient": "Hiring Team\\n{company}",
  "salutation": "Dear {company} Hiring Team,",
  "paragraphs": [
    "[Para 1 — hook with company-specific observation + Barron's highest-impact metric]",
    "[Para 2 — primary match: Alibaba → JD requirement #1 and #2 with 2+ metrics]",
    "[Para 3 — secondary match: Next2Market → JD requirement #3 with metrics]",
    "[Para 4 — closing: specific role, 90-day plan, confident CTA]"
  ],
  "sign_off": "Sincerely,\\n\\nBarron Zuo"
}}"""


def generate_docx(content_json: dict, doc_type: str, output_path: str) -> bool:
    content_str = json.dumps(content_json)
    result = subprocess.run(
        [sys.executable, str(GENERATE_SCRIPT),
         "--type", doc_type,
         "--template", str(TEMPLATE_DOCX),
         "--content", content_str,
         "--output", output_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"[craft-resume] DOCX error: {result.stderr}", file=sys.stderr)
        return False
    try:
        result_json = json.loads(result.stdout)
        return result_json.get("success", False)
    except Exception:
        return result.returncode == 0


def make_filename(company: str, role: str, suffix: str) -> str:
    def pascal(s):
        return re.sub(r'[^a-zA-Z0-9]', '_', s).strip('_')
    c = pascal(company)
    r = pascal(role)[:30]
    return f"Barron_Zuo_{c}_{r}_{suffix}.docx"


def append_ledger(company: str, role: str, job_id: str, resume_file: str, cl_file: str):
    entry = f"{company}|{role}|{job_id}|{date.today()}|generated|{resume_file}|{cl_file}\n"
    try:
        with open(LEDGER, 'a') as f:
            f.write(entry)
    except Exception:
        pass


def cmd_list():
    files = sorted(OUTPUT_DIR.glob("*.docx"), key=os.path.getmtime, reverse=True)
    if not files:
        print("No .docx files found in", OUTPUT_DIR)
        return
    print(f"{'File':<70} {'Size':>8} {'Modified'}")
    print("-" * 90)
    for f in files[:20]:
        stat = f.stat()
        from datetime import datetime
        mod = datetime.fromtimestamp(stat.st_mtime).strftime('%m/%d %H:%M')
        print(f"{f.name:<70} {stat.st_size//1024:>6}K  {mod}")


def cmd_preview():
    if not CACHE_FILE.exists():
        print("No cached resume found. Run craft-resume first.")
        return
    data = json.loads(CACHE_FILE.read_text())
    print(json.dumps(data, indent=2))


def main():
    parser = argparse.ArgumentParser(description='craft-resume — AI resume generator for Barron Zuo')
    parser.add_argument('--company', help='Company name')
    parser.add_argument('--role', help='Job role/title')
    parser.add_argument('--jd-file', help='Path to JD text file')
    parser.add_argument('--jd-text', help='JD text inline')
    parser.add_argument('--jd-url', help='URL to fetch JD from')
    parser.add_argument('--job-id', default='manual', help='Greenhouse job ID for ledger')
    parser.add_argument('--output-dir', default=str(OUTPUT_DIR), help='Output directory')
    parser.add_argument('--no-cover-letter', action='store_true', help='Skip cover letter')
    parser.add_argument('--model', default=DEFAULT_MODEL, help='Claude model')
    parser.add_argument('--dry-run', action='store_true', help='Print JSON, skip .docx')
    parser.add_argument('--preview', action='store_true', help='Show last generated resume JSON')
    parser.add_argument('--list', action='store_true', help='List recent resumes')
    args = parser.parse_args()

    if args.list:
        cmd_list(); return
    if args.preview:
        cmd_preview(); return

    # Validate required args
    if not args.company or not args.role:
        parser.error("--company and --role are required")

    # Get JD text
    jd_text = ""
    if args.jd_text:
        jd_text = args.jd_text
    elif args.jd_file:
        jd_text = Path(args.jd_file).read_text()
    elif args.jd_url:
        print(f"[craft-resume] Fetching JD from {args.jd_url}...")
        jd_text = fetch_jd_from_url(args.jd_url)
    else:
        print("[craft-resume] ERROR: Provide --jd-text, --jd-file, or --jd-url", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # --- RESUME ---
    print(f"[craft-resume] Generating tailored resume for {args.company} — {args.role}...")
    resume_prompt = build_resume_prompt(jd_text, args.company, args.role)
    
    print(f"[craft-resume] Calling Claude ({args.model})...")
    resume_response = call_claude(resume_prompt, args.model)
    
    try:
        resume_json = extract_json_from_response(resume_response)
    except ValueError as e:
        print(f"[craft-resume] ERROR parsing resume JSON: {e}", file=sys.stderr)
        print("Raw response saved to /tmp/craft-resume-debug.txt")
        Path("/tmp/craft-resume-debug.txt").write_text(resume_response)
        sys.exit(1)

    # Cache for preview
    CACHE_FILE.write_text(json.dumps(resume_json, indent=2))

    resume_filename = make_filename(args.company, args.role, "Resume")
    resume_path = str(out_dir / resume_filename)

    if args.dry_run:
        print("\n=== RESUME JSON ===")
        print(json.dumps(resume_json, indent=2))
    else:
        print(f"[craft-resume] Writing resume DOCX → {resume_filename}")
        ok = generate_docx(resume_json, "resume", resume_path)
        if ok:
            print(f"[craft-resume] ✓ Resume: {resume_path}")
        else:
            print(f"[craft-resume] ✗ Resume DOCX generation failed")

    # --- COVER LETTER ---
    cl_filename = "N/A"
    if not args.no_cover_letter:
        print(f"[craft-resume] Generating cover letter...")
        cl_prompt = build_cover_letter_prompt(jd_text, args.company, args.role, resume_json)
        cl_response = call_claude(cl_prompt, args.model)
        
        try:
            cl_json = extract_json_from_response(cl_response)
        except ValueError as e:
            print(f"[craft-resume] WARNING: Cover letter JSON parse failed: {e}", file=sys.stderr)
            cl_json = None

        if cl_json:
            cl_filename = make_filename(args.company, args.role, "Cover_Letter")
            cl_path = str(out_dir / cl_filename)
            if args.dry_run:
                print("\n=== COVER LETTER JSON ===")
                print(json.dumps(cl_json, indent=2))
            else:
                ok = generate_docx(cl_json, "cover_letter", cl_path)
                if ok:
                    print(f"[craft-resume] ✓ Cover Letter: {cl_path}")
                else:
                    print(f"[craft-resume] ✗ Cover letter DOCX failed")

    # --- LEDGER ---
    append_ledger(args.company, args.role, args.job_id, resume_filename, cl_filename)

    # --- SUMMARY ---
    meta = resume_json.get("meta", {})
    print(f"\n{'='*60}")
    print(f"CRAFT-RESUME COMPLETE")
    print(f"{'='*60}")
    print(f"  Company:        {args.company}")
    print(f"  Role:           {args.role}")
    print(f"  North Star:     {meta.get('north_star_metric', 'N/A')}")
    print(f"  Keywords:       {', '.join(meta.get('top_keywords_covered', []))}")
    print(f"  Alibaba title:  {meta.get('title_adaptations', {}).get('alibaba', 'N/A')}")
    print(f"  N2M title:      {meta.get('title_adaptations', {}).get('next2market', 'N/A')}")
    print(f"  Resume file:    {resume_filename}")
    print(f"  CL file:        {cl_filename}")
    print(f"  Output dir:     {out_dir}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
