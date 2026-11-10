#!/usr/bin/env python3
"""Fail when a blog article promises a bank import the app cannot do (ABA-740).

A bank-import article is one whose `slug` names an import/statement topic and a bank
(`import-wyciagu-erste-bank`, `import-revolut-statement-to-budget-app`, ...). For each:

* ERROR   — the bank has no parser at all (not in the API parser registry, not Wise).
            The article promises something the product does not do.
* WARNING — the bank has a parser, but it is hidden from the import picker
            (`IMPORT_ENTRIES` in the mobile app), AND the article never points the reader
            to auto-detect. Auto-detect still runs the parser and the AI import is the
            fallback, so the promise holds — but there is no "<bank>" row to pick, and the
            parser is unvalidated against real exports
            (docs/wiki/features/bank-statement-import.md).

Sources of truth are read from the code, so adding a parser or showing a bank in the
picker needs no change here; adding a NEW bank name to the blog does (BANKS below).

Exit code: 1 on any ERROR, 0 otherwise (warnings print but do not fail).
"""
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REGISTRY = os.path.join(ROOT, 'apps/api/src/modules/import-bank/parsers/registry.ts')
PICKER = os.path.join(ROOT, 'apps/mobile/src/features/import/importEntries.ts')
WISE_MODULE = os.path.join(ROOT, 'apps/api/src/modules/import-wise')
BLOG = os.path.join(ROOT, 'docs/marketing/seo')

# Bank id -> slug pattern. The id is the parser id used by the registry and the picker.
BANKS = {
    'pko': r'pko|ipko',
    'mbank': r'mbank',
    'ing': r'(?<![a-z])ing(?![a-z])',
    'millennium': r'millennium',
    'pekao': r'pekao',
    'alior': r'alior',
    'erste': r'erste',
    'revolut': r'revolut',
    'wise': r'(?<![a-z])wise(?![a-z])',
    # Banks with no parser today — listed so an article about them is caught.
    'santander': r'santander',
    'nest': r'nest-?bank',
    'bnp': r'bnp',
    'credit-agricole': r'credit-?agricole',
    'citi': r'citi',
    'velobank': r'velo-?bank',
    'n26': r'(?<![a-z])n26(?![a-z])',
}
TOPIC = re.compile(r'import|wyciag|statement|vypis|kontoauszug|releve|extracto|afschrift|vypisk', re.I)
# How an honest article about a picker-hidden bank tells the reader to import it.
AUTO_DETECT = re.compile(
    r'rozpoznaj automatycznie|autorozpozn|auto-?detect|detect automatically|automatisch erkennen|'
    r'détection automatique|detectar automáticamente|automatisch herkennen|автоопредел|автавызнач|автовизнач',
    re.I,
)


def parser_ids():
    src = open(REGISTRY, encoding='utf-8').read()
    ids = set(re.findall(r"from '\./([a-z0-9-]+)\.parser'", src))
    if os.path.isdir(WISE_MODULE):
        ids.add('wise')
    return ids


def picker_ids():
    src = open(PICKER, encoding='utf-8').read()
    block = src.split('export const IMPORT_ENTRIES', 1)[1].split('];', 1)[0]
    return set(re.findall(r"id: '([a-z0-9-]+)'", block))


def articles():
    for dirpath, dirnames, files in os.walk(BLOG):
        dirnames[:] = [d for d in dirnames if d not in ('site', 'assets', '__pycache__')]
        for f in files:
            if not f.endswith('.md'):
                continue
            p = os.path.join(dirpath, f)
            head = open(p, encoding='utf-8').read(2000)
            m = re.search(r'^slug:\s*"?([^"\n]+)"?', head, re.M)
            if m:
                yield os.path.relpath(p, ROOT).replace(os.sep, '/'), m.group(1).strip()


def main():
    parsers, picker = parser_ids(), picker_ids()
    errors, warnings, checked = [], [], 0
    for path, slug in articles():
        if not TOPIC.search(slug):
            continue
        for bank, pat in BANKS.items():
            if not re.search(pat, slug, re.I):
                continue
            checked += 1
            if bank not in parsers:
                errors.append(f'{path}: "{slug}" promises a {bank} import, but no {bank} parser exists')
            elif bank not in picker:
                body = open(os.path.join(ROOT, path), encoding='utf-8').read()
                if not AUTO_DETECT.search(body):
                    warnings.append(
                        f'{path}: {bank} is hidden in the import picker (auto-detect only), '
                        'but the article never tells the reader to use auto-detect'
                    )
    for w in warnings:
        print(f'WARNING {w}')
    for e in errors:
        print(f'ERROR   {e}')
    print(f'checked {checked} bank-import article(s): {len(errors)} error(s), {len(warnings)} warning(s)')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
