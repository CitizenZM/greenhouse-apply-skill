#!/usr/bin/env python3
"""简历事实校验闸门 — 提交前强制校对不可变事实。

为什么需要它（2026-08-30 实测）：
经历库的 IMMUTABLE RULES 写着日期“NEVER CHANGE”，但抽查 500 份已生成
简历发现：
    WeWork      规定 2019–2020，实际 226/234 份写成 2018–2020
    Indiegogo   规定 2018–2019，实际 249/257 份写成 2016–2018
    GSV         规定 2010–2016，实际 248/293 份写成 2015–2016
光在文档里写“不可变”没用 — 必须有东西在提交前拦下来。

任职日期与公司名是雇主能直接向前雇主核实的事实，背调必查。

用法：
    python3 resume_guard.py <resume.docx>          # 单份校验
    python3 resume_guard.py --scan <目录>          # 批量审计
    python3 resume_guard.py --json <resume.docx>

退出码：0=通过  1=有不符（**不得提交**）  2=读不了文件
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path

# ───── 不可变事实（Barron 于 2026-08-30 最终确认）─────
# 这五行是唯一真值源。改它之前先问 Barron。
LOCKED = {
    "GSV":         ("2010", "2016"),
    "Indiegogo":   ("2018", "2019"),
    "WeWork":      ("2019", "2020"),
    "Next2Market": ("2020", "2022"),
    "Alibaba":     ("2022", "Present"),
}

# 公司在简历里可能的写法 → 规范 key
ALIASES = {
    "gsv": "GSV", "gsv capital": "GSV", "gsv asset": "GSV",
    "indiegogo": "Indiegogo",
    "wework": "WeWork", "we work": "WeWork",
    "next2market": "Next2Market", "next 2 market": "Next2Market",
    "alibaba": "Alibaba", "aliexpress": "Alibaba", "alipay": "Alibaba",
}

# 年份区间：容忍连字符/破折号/到，也容忍月份前缀
RANGE_RE = re.compile(
    r"(?:[A-Z][a-z]{2,8}\.?\s+)?(\d{4})\s*[–—\-~至to]+\s*"
    r"(?:[A-Z][a-z]{2,8}\.?\s+)?(\d{4}|Present|present|Now|now|至今)"
)


def doc_lines(path: Path) -> list[str]:
    x = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8", "replace")
    x = re.sub(r"<w:p[ >]", "\n<w:p ", x)
    x = re.sub(r"<[^>]+>", "", x).replace("&amp;", "&")
    return [l.strip() for l in x.split("\n") if l.strip()]


def canon(line: str) -> str | None:
    low = line.lower()
    for alias, key in ALIASES.items():
        if alias in low:
            return key
    return None


def check(path: Path) -> dict:
    """返回 {ok, findings[], seen{}}。findings 非空即不得提交。"""
    try:
        lines = doc_lines(path)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "unreadable": str(e)[:120],
                "findings": [], "seen": {}}

    findings, seen = [], {}
    for i, ln in enumerate(lines):
        co = canon(ln)
        if not co:
            continue
        # 日期可能在同行或紧邻的下一、下两行（公司行 / 职位行 | 日期）
        for cand in (ln, *lines[i + 1:i + 3]):
            m = RANGE_RE.search(cand)
            if not m:
                continue
            start, end = m.group(1), m.group(2)
            end = "Present" if end.lower() in {"present", "now", "至今"} else end
            want_s, want_e = LOCKED[co]
            seen.setdefault(co, f"{start}–{end}")
            if (start, end) != (want_s, want_e):
                findings.append({
                    "company": co,
                    "found": f"{start}–{end}",
                    "expected": f"{want_s}–{want_e}",
                    "line": cand[:90],
                })
            break

    missing = [c for c in LOCKED if c not in seen]
    return {"ok": not findings, "findings": findings,
            "seen": seen, "missing": missing}


def render(path: Path, res: dict) -> str:
    if res.get("unreadable"):
        return f"⚠️  读不了：{path.name} — {res['unreadable']}"
    if res["ok"]:
        extra = f"（未出现：{'、'.join(res['missing'])}）" if res["missing"] else ""
        return f"✅ {path.name} — 日期与公司名均符合锁定事实{extra}"
    out = [f"❌ {path.name} — {len(res['findings'])} 处不符，**不得提交**"]
    for f in res["findings"]:
        out.append(f"     {f['company']}：写的是 {f['found']}，"
                   f"应为 {f['expected']}")
        out.append(f"       └ {f['line']}")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description="简历事实校验闸门")
    ap.add_argument("target", nargs="?", help="简历 .docx")
    ap.add_argument("--scan", help="批量审计一个目录")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    if a.scan:
        files = sorted(Path(a.scan).glob("*Resume*.docx"))
        if a.limit:
            files = files[:a.limit]
        bad = unreadable = 0
        per_co: dict[str, int] = {}
        for f in files:
            r = check(f)
            if r.get("unreadable"):
                unreadable += 1
                continue
            if not r["ok"]:
                bad += 1
                for x in r["findings"]:
                    per_co[x["company"]] = per_co.get(x["company"], 0) + 1
        ok = len(files) - bad - unreadable
        print(f"审计 {len(files)} 份：通过 {ok}、不符 {bad}、读不了 {unreadable}")
        if per_co:
            print("\n按公司的不符次数：")
            for c, n in sorted(per_co.items(), key=lambda x: -x[1]):
                print(f"  {n:5d}  {c}（应为 {LOCKED[c][0]}–{LOCKED[c][1]}）")
        return 1 if bad else 0

    if not a.target:
        ap.error("需要一份 .docx 或 --scan <目录>")
    p = Path(a.target)
    res = check(p)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
    else:
        print(render(p, res))
    if res.get("unreadable"):
        return 2
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
