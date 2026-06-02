#!/usr/bin/env python3
"""
Job sourcing script — scrapes tier1/tier2/tier6 sources and builds a deduplicated queue.

Usage:
  python3 source-jobs.py --tier 1,2 --limit 50 --output /tmp/new_jobs.json
  python3 source-jobs.py --tier 6 --output /tmp/direct_company_jobs.json
  python3 source-jobs.py --hn-api --output /tmp/hn_jobs.json

Sources used: job-sources.json (tier1=always, tier2=3-day cadence, tier6=weekly company scans)
Dedup: seen-job-ids.json + both ledgers (Greenhouse + Ashby)
"""

import argparse
import json
import re
import sys
import os
import urllib.request
import urllib.parse
from datetime import date

SKILL_DIR = os.path.expanduser("~/.claude/skills/greenhouse-apply")
DATA_DIR = os.path.join(SKILL_DIR, "data")
SOURCES_FILE = os.path.join(DATA_DIR, "job-sources.json")
SEEN_IDS_FILE = os.path.join(DATA_DIR, "seen-job-ids.json")
LEDGER_GH = os.path.expanduser("~/Documents/Obsidian/01-Projects/Greenhouse-Application-Ledger.md")
LEDGER_ASHBY = os.path.expanduser("~/Documents/Obsidian/01-Projects/Ashby-Application-Ledger.md")

KEYWORDS = [
    "VP Marketing", "Head of Growth", "Director Growth Marketing",
    "Director Product Marketing", "VP Demand Generation",
    "Director Performance Marketing", "VP GTM", "Head of Partnerships",
    "VP Brand", "Director Digital Marketing", "CMO",
    "Head of Content Strategy", "VP Revenue Marketing",
    "Director Organic Growth", "Sr Director Marketing"
]

SENIORITY_PATTERNS = re.compile(
    r'\b(VP|Vice President|Director|Sr\.?\s+Director|Senior Director|'
    r'Head of|CMO|CGO|SVP|EVP|Chief Marketing|Chief Growth)\b',
    re.IGNORECASE
)

MIN_SALARY = 160000


def load_seen_ids():
    if os.path.exists(SEEN_IDS_FILE):
        with open(SEEN_IDS_FILE) as f:
            return set(json.load(f))
    return set()


def save_seen_ids(seen):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SEEN_IDS_FILE, "w") as f:
        json.dump(sorted(seen), f, indent=2)


def load_ledger_ids():
    seen = set()
    for path in [LEDGER_GH, LEDGER_ASHBY]:
        if not os.path.exists(path):
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("|"):
                    continue
                parts = line.split("|")
                if len(parts) >= 3:
                    # Format: company|job_title|job_id|...
                    company = parts[0].strip().lower()
                    title = parts[1].strip().lower() if len(parts) > 1 else ""
                    job_id = parts[2].strip() if len(parts) > 2 else ""
                    if job_id:
                        seen.add(job_id)
                    seen.add(f"{company}::{title}")
    return seen


def normalize_company(name):
    name = re.sub(r'\b(Inc|LLC|Corp|Ltd|Co|Technologies|Technology|Labs|AI|Group)\b\.?', '', name, flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', name).strip().lower()


GREENHOUSE_TARGET_COMPANIES = [
    "anthropic", "figma", "notion", "vercel", "stripe", "brex", "rippling",
    "scaleai", "openai", "perplexityai", "wiz", "databricks", "datadog",
    "hashicorp", "airtable", "miro", "carta", "plaid", "gusto", "checkr",
    "amplitude", "mixpanel", "intercom", "retool", "linear", "loom"
]


def fetch_greenhouse_company_api(keyword, seen_all, limit=30):
    """Fetch from Greenhouse public boards API for target companies."""
    results = []
    kw_lower = keyword.lower()
    for slug in GREENHOUSE_TARGET_COMPANIES:
        if len(results) >= limit:
            break
        try:
            url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            for job in data.get("jobs", []):
                title = job.get("title", "")
                if not SENIORITY_PATTERNS.search(title):
                    continue
                if not re.search(r'\b(market|growth|brand|gtm|demand|content|digital|partner)\b', title, re.IGNORECASE):
                    continue
                job_id = str(job.get("id", ""))
                if not job_id or job_id in seen_all:
                    continue
                co = normalize_company(slug.replace("-", " "))
                dedup_key = f"{co}::{title.strip().lower()}"
                if dedup_key in seen_all:
                    continue
                results.append({
                    "job_id": job_id,
                    "title": title.strip(),
                    "company": slug,
                    "url": f"https://job-boards.greenhouse.io/{slug}/jobs/{job_id}",
                    "ats": "greenhouse",
                    "source": f"greenhouse_api_{slug}",
                    "salary": None,
                    "status": "queued"
                })
                seen_all.add(job_id)
                seen_all.add(dedup_key)
                if len(results) >= limit:
                    break
        except Exception as e:
            print(f"[greenhouse_api_{slug}]: {e}", file=sys.stderr)
    return results


def fetch_remoteok_api(keyword, seen_all, limit=10):
    """Fetch from RemoteOK public JSON API."""
    results = []
    try:
        url = "https://remoteok.com/api"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        kw_lower = keyword.lower()
        for job in data:
            if not isinstance(job, dict):
                continue
            title = job.get("position", "")
            if not SENIORITY_PATTERNS.search(title):
                continue
            tags = " ".join(job.get("tags", [])).lower()
            if "marketing" not in tags and "growth" not in tags and kw_lower not in title.lower():
                continue
            # Salary check
            salary_max = job.get("salary_max", 0) or 0
            if salary_max and int(salary_max) < MIN_SALARY:
                continue
            job_id = str(job.get("id", ""))
            if not job_id or job_id in seen_all:
                continue
            co = normalize_company(job.get("company", ""))
            dedup_key = f"{co}::{title.strip().lower()}"
            if dedup_key in seen_all:
                continue
            results.append({
                "job_id": job_id,
                "title": title.strip(),
                "company": job.get("company", ""),
                "url": job.get("url", ""),
                "ats": "native",
                "source": "remoteok_api",
                "salary": {"min": job.get("salary_min"), "max": job.get("salary_max")},
                "status": "queued"
            })
            seen_all.add(job_id)
            seen_all.add(dedup_key)
            if len(results) >= limit:
                break
    except Exception as e:
        print(f"[remoteok_api] {keyword}: {e}", file=sys.stderr)
    return results


def fetch_hn_whoshiring(seen_all, limit=20):
    """Fetch from HN Algolia API — Who's Hiring thread comments."""
    results = []
    try:
        # Get the latest Who's Hiring thread
        url = "https://hn.algolia.com/api/v1/search?query=who%27s%20hiring&tags=ask_hn&hitsPerPage=5"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        thread_ids = [h["objectID"] for h in data.get("hits", []) if "hiring" in h.get("title", "").lower()]
        if not thread_ids:
            return results
        thread_id = thread_ids[0]
        # Get comments
        comments_url = f"https://hn.algolia.com/api/v1/search?tags=comment,story_{thread_id}&hitsPerPage=500"
        req = urllib.request.Request(comments_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            cdata = json.loads(resp.read())
        for hit in cdata.get("hits", []):
            text = hit.get("comment_text", "") or ""
            if not SENIORITY_PATTERNS.search(text):
                continue
            if not re.search(r'\b(market|growth|brand|gtm|demand|product marketing)\b', text, re.IGNORECASE):
                continue
            # Extract company and title from first line
            lines = re.sub(r'<[^>]+>', '', text).strip().split("\n")
            first_line = lines[0] if lines else ""
            # Try to find a URL
            url_match = re.search(r'https?://\S+', text)
            apply_url = url_match.group(0).rstrip(".,)>") if url_match else ""
            job_id = hit.get("objectID", "")
            if job_id in seen_all:
                continue
            results.append({
                "job_id": f"hn_{job_id}",
                "title": first_line[:100],
                "company": "Unknown (HN)",
                "url": apply_url or f"https://news.ycombinator.com/item?id={thread_id}",
                "ats": "unknown",
                "source": "hn_whoshiring",
                "salary": None,
                "status": "queued_manual_review"
            })
            seen_all.add(job_id)
            if len(results) >= limit:
                break
    except Exception as e:
        print(f"[hn_whoshiring]: {e}", file=sys.stderr)
    return results


def fetch_direct_company_careers(seen_all, limit=5):
    """Fetch from tier6 direct company career pages via Greenhouse public API."""
    sources = json.load(open(SOURCES_FILE))
    companies = sources["tiers"]["tier6_direct_company_careers"]["companies"]
    results = []
    for company in companies:
        ats = company.get("ats")
        if ats != "greenhouse":
            continue
        careers_url = company.get("careers_url", "")
        slug_match = re.search(r'boards\.greenhouse\.io/(\w+)', careers_url)
        if not slug_match:
            continue
        slug = slug_match.group(1)
        try:
            url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            found = 0
            for job in data.get("jobs", []):
                title = job.get("title", "")
                if not SENIORITY_PATTERNS.search(title):
                    continue
                if not re.search(r'\b(market|growth|brand|gtm|demand|content|digital|partner)\b', title, re.IGNORECASE):
                    continue
                job_id = str(job.get("id", ""))
                if not job_id or job_id in seen_all:
                    continue
                co = normalize_company(company["name"])
                dedup_key = f"{co}::{title.strip().lower()}"
                if dedup_key in seen_all:
                    continue
                results.append({
                    "job_id": job_id,
                    "title": title.strip(),
                    "company": company["name"],
                    "url": f"https://job-boards.greenhouse.io/{slug}/jobs/{job_id}",
                    "ats": "greenhouse",
                    "source": f"direct_{slug}",
                    "salary": None,
                    "status": "queued"
                })
                seen_all.add(job_id)
                seen_all.add(dedup_key)
                found += 1
                if found >= limit:
                    break
        except Exception as e:
            print(f"[direct_{slug}]: {e}", file=sys.stderr)
    return results


def main():
    parser = argparse.ArgumentParser(description="Source jobs from multiple boards into a deduped queue")
    parser.add_argument("--tier", default="1,2", help="Comma-separated tier numbers to run (1,2,3,6)")
    parser.add_argument("--hn-api", action="store_true", help="Include HN Who's Hiring API")
    parser.add_argument("--limit", type=int, default=50, help="Max jobs to return")
    parser.add_argument("--output", default="/tmp/sourced_jobs.json", help="Output JSON path")
    parser.add_argument("--keyword", default=None, help="Override keyword (default: rotate through all)")
    args = parser.parse_args()

    tiers = set(t.strip() for t in args.tier.split(","))
    seen_ids = load_seen_ids()
    ledger_ids = load_ledger_ids()
    seen_all = seen_ids | ledger_ids

    all_jobs = []
    keywords = [args.keyword] if args.keyword else KEYWORDS

    if "1" in tiers or "2" in tiers:
        jobs = fetch_greenhouse_company_api(keywords[0], seen_all, limit=args.limit)
        all_jobs.extend(jobs)

    if "3" in tiers:
        for kw in keywords[:3]:
            jobs = fetch_remoteok_api(kw, seen_all, limit=10)
            all_jobs.extend(jobs)

    if "6" in tiers:
        jobs = fetch_direct_company_careers(seen_all, limit=3)
        all_jobs.extend(jobs)

    if args.hn_api:
        jobs = fetch_hn_whoshiring(seen_all, limit=20)
        all_jobs.extend(jobs)

    # Trim to limit
    all_jobs = all_jobs[:args.limit]

    # Update seen IDs cache
    for job in all_jobs:
        seen_ids.add(job["job_id"])
    save_seen_ids(seen_ids)

    # Write output
    output = {
        "generated": date.today().isoformat(),
        "count": len(all_jobs),
        "jobs": all_jobs
    }
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(json.dumps({
        "success": True,
        "count": len(all_jobs),
        "output": args.output,
        "sources_used": list(set(j["source"] for j in all_jobs))
    }))


if __name__ == "__main__":
    main()
