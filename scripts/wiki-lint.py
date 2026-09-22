#!/usr/bin/env python3
"""Cheap, LLM-free health check for docs/wiki.

Checks only what a script can know for certain:

  * every markdown link between wiki pages resolves to a file that exists;
  * every backticked path that looks like a repo path exists on disk;
  * every page under features/ is reachable from index.md (no orphans).

Deliberately does NOT check counts. A page should not state a count in the first
place -- they go stale silently, and that is how the previous wiki came to claim
"11 AI functions" when there were 18.

Exit code 1 on any finding, so this can run in CI.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "docs" / "wiki"

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
# A backticked token is checked only when it is unambiguously a repo-root path:
# it starts with a top-level directory and ends in a known source extension.
#
# Pages legitimately cite paths relative to their app (`src/stores/chatStore.ts`)
# or relative to the module under discussion (`helpers/i18n.ts`). Resolving those
# would mean guessing a base, and a checker that guesses produces findings nobody
# trusts — which is worse than a narrower one that is always right.
PATH_RE = re.compile(
    r"`((?:apps|packages|scripts|docs)/[A-Za-z0-9_./@-]+\.(?:ts|tsx|js|jsx|py|kt|json|md|sh|prisma|yml|yaml))`"
)


def main() -> int:
    if not WIKI.is_dir():
        print(f"no wiki at {WIKI}")
        return 1

    pages = sorted(WIKI.rglob("*.md"))
    findings: list[str] = []

    for page in pages:
        rel = page.relative_to(ROOT).as_posix()
        text = page.read_text(encoding="utf-8")

        for target in LINK_RE.findall(text):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            target = target.split("#", 1)[0]
            if not target:
                continue
            if not (page.parent / target).resolve().exists():
                findings.append(f"{rel}: dead link -> {target}")

        for cited in PATH_RE.findall(text):
            if cited.startswith(("http", "@")) or "/" not in cited:
                continue
            # Paths are written relative to the repo root.
            if not (ROOT / cited).exists():
                findings.append(f"{rel}: cited path does not exist -> {cited}")

    index = WIKI / "index.md"
    if index.exists():
        indexed = set(LINK_RE.findall(index.read_text(encoding="utf-8")))
        for page in pages:
            if page.parent.name != "features":
                continue
            link = f"features/{page.name}"
            if link not in indexed:
                findings.append(f"{page.relative_to(ROOT).as_posix()}: orphan, not linked from index.md")

    if findings:
        print(f"wiki-lint: {len(findings)} finding(s)")
        for f in findings:
            print(f"  {f}")
        return 1

    print(f"wiki-lint: {len(pages)} pages, no findings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
