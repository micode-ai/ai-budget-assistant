"""Add pillar -> cluster down-links to the 3 blog pillars in all 9 languages.

Reads each article's frontmatter (title/slug/pair/lang) from the Markdown sources,
then appends (or replaces) a localized "Related guides" block at the end of each
pillar file listing its cluster children as absolute /blog/<lang>/<slug>/ links.

Idempotent: re-running replaces the previously generated block.
"""
import os
import re
import sys

ROOT = os.path.join("docs", "marketing", "seo")
LANGS = ["pl", "en", "de", "es", "fr", "ru", "ua", "be", "nl"]

# pillar pair -> cluster pairs that link up to it
CLUSTERS = {
    "budget": ["shared-budget", "envelope", "rule-503020", "categories", "family", "ai-budget", "school"],
    "expenses": ["bank-import", "best-apps", "expense-map", "auto-capture", "receipts", "split-bill"],
    "saving": ["groceries", "emergency-fund", "subscriptions", "debt", "inflation"],
}

LABEL = {
    "pl": "Powiązane przewodniki",
    "en": "Related guides",
    "de": "Verwandte Ratgeber",
    "es": "Guías relacionadas",
    "fr": "Guides associés",
    "ru": "Похожие руководства",
    "ua": "Схожі посібники",
    "be": "Падобныя дапаможнікі",
    "nl": "Gerelateerde gidsen",
}

MARKER = "<!-- pillar-downlinks -->"


def read_front(path):
    text = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None, text
    front = {}
    for line in m.group(1).splitlines():
        km = re.match(r'^(\w+):\s*"?(.*?)"?\s*$', line)
        if km:
            front[km.group(1)] = km.group(2)
    return front, text


def main():
    # index: (lang, pair) -> (title, slug, path)
    idx = {}
    for lang in LANGS:
        d = ROOT if lang == "pl" else os.path.join(ROOT, lang)
        for name in sorted(os.listdir(d)):
            if not re.match(r"^\d\d-.*\.md$", name):
                continue
            path = os.path.join(d, name)
            front, _ = read_front(path)
            if not front or "pair" not in front:
                continue
            if front.get("lang") != lang:
                print(f"  WARN lang mismatch in {path}: {front.get('lang')} != {lang}")
            idx[(lang, front["pair"])] = (front["title"], front["slug"], path)

    changed = 0
    for lang in LANGS:
        for pillar, children in CLUSTERS.items():
            key = (lang, pillar)
            if key not in idx:
                print(f"  MISSING pillar {pillar} for {lang}")
                continue
            _, _, path = idx[key]
            items = []
            for child in children:
                ck = (lang, child)
                if ck not in idx:
                    print(f"  MISSING {child} for {lang}")
                    continue
                ctitle, cslug, _ = idx[ck]
                items.append(f"- [{ctitle}](/blog/{lang}/{cslug}/)")
            if not items:
                continue

            block = MARKER + "\n\n## " + LABEL[lang] + "\n\n" + "\n".join(items) + "\n"
            text = open(path, encoding="utf-8").read()
            if MARKER in text:
                text = text[: text.index(MARKER)].rstrip("\n") + "\n\n" + block
            else:
                text = text.rstrip("\n") + "\n\n" + block
            open(path, "w", encoding="utf-8", newline="\n").write(text)
            changed += 1
            print(f"  {lang}/{pillar}: {len(items)} down-links")

    print(f"\nupdated {changed} pillar files")


if __name__ == "__main__":
    if not os.path.isdir(ROOT):
        sys.exit("run from repo root")
    main()
