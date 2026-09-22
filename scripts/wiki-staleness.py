#!/usr/bin/env python3
"""Report wiki pages whose subject matter has moved on without them.

For each page, compare when the page was last committed against when each repo
path it cites was last committed. A page whose cited code changed afterwards is
not necessarily wrong -- but it is the only machine-checkable signal that a
"stale claim" may have appeared, and stale claims are what killed the previous
wiki (it went on stating "11 AI functions" for four months).

This is the cheap half of the lint. The semantic half -- contradictions between
pages, missing cross-references, data gaps -- needs a reading pass and lives in
the `wiki-audit` skill.

Prints a markdown report on stdout. Exit code is 0 even when it finds something:
this is a report, not a gate. Nobody should be blocked from merging because a
page is a week behind.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "docs" / "wiki"

PATH_RE = re.compile(
    r"`((?:apps|packages|scripts|docs)/[A-Za-z0-9_./@-]+\.(?:ts|tsx|js|jsx|py|kt|json|md|sh|prisma|yml|yaml))`"
)

# A page that is merely a few commits behind is noise. This threshold is about
# "the ground moved", not "someone touched a file".
MIN_COMMITS = 3


def last_commit_ts(path: str) -> int | None:
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", path],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return int(out) if out else None
    except Exception:
        return None


def commits_since(path: str, since_ts: int) -> int:
    try:
        out = subprocess.run(
            ["git", "log", "--oneline", f"--since=@{since_ts}", "--", path],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return len([l for l in out.splitlines() if l])
    except Exception:
        return 0


def main() -> int:
    if not WIKI.is_dir():
        print(f"no wiki at {WIKI}")
        return 0

    ts_cache: dict[str, int | None] = {}
    findings: list[tuple[str, list[tuple[str, int]]]] = []

    for page in sorted(WIKI.rglob("*.md")):
        rel = page.relative_to(ROOT).as_posix()
        page_ts = last_commit_ts(rel)
        if page_ts is None:
            continue  # never committed; nothing to compare against

        moved: list[tuple[str, int]] = []
        for cited in sorted(set(PATH_RE.findall(page.read_text(encoding="utf-8")))):
            if not (ROOT / cited).exists():
                continue  # wiki-lint reports this separately
            if cited not in ts_cache:
                ts_cache[cited] = last_commit_ts(cited)
            cited_ts = ts_cache[cited]
            if cited_ts is None or cited_ts <= page_ts:
                continue
            n = commits_since(cited, page_ts)
            if n >= MIN_COMMITS:
                moved.append((cited, n))

        if moved:
            moved.sort(key=lambda x: -x[1])
            findings.append((rel, moved))

    if not findings:
        print("wiki-staleness: every page is at least as new as the code it cites.")
        return 0

    findings.sort(key=lambda f: -sum(n for _, n in f[1]))
    print("## Pages whose cited code has moved on\n")
    print(f"A page is listed when a file it cites has had **{MIN_COMMITS}+ commits** since the page")
    print("was last touched. That is a prompt to re-read, not proof of an error.\n")
    for rel, moved in findings:
        print(f"### `{rel}`")
        for cited, n in moved:
            print(f"- `{cited}` — {n} commits since")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
