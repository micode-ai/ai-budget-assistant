# -*- coding: utf-8 -*-
"""
Build a static, crawlable, MULTILINGUAL HTML help center from the in-app user docs.

Mirrors the SEO blog pipeline (docs/marketing/seo/build_blog.py) and REUSES its
chrome (header/footer/cookie-consent/GA/OG image/CSS) so the help center looks and
behaves identically and stays in sync. Help lives at /help and shares the landing's
header + footer.

Sources: user_docs/<lang>/NN-slug.md (the SAME files that feed the in-app help via
scripts/generate-help-content.js). Each doc's first `# ` line is the title and first
`> ` line is the meta description. Slugs are the section id with the NN- prefix
stripped and are IDENTICAL across languages (the folder is the language), so hreflang
pairs by slug. `00-index` is not a page; it seeds the per-language /help/<lang>/ index.

SEO-safe i18n: each language at /help/<lang>/<slug>/ + a per-language /help/<lang>/
index; hreflang pairs by slug (x-default = en); thin pages (< THIN_WORDS) get
robots=noindex,follow and are kept out of the sitemap. /help/ is a noindex JS
dispatcher (navigator.language) NOT in the sitemap.

Cross-doc links `[t](./NN-slug.md)` become real /help/<lang>/<slug>/ internal links;
image refs `![a](../img/X.jpg)` are rewritten to /help/assets/img/X.jpg and the image
folder is copied once.

Run: python docs/marketing/help/build_help.py   (regenerate after editing any user_docs file)
"""
import os, re, json, html, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
# reuse the blog generator's proven chrome (head/foot/consent/OG/CSS/constants)
sys.path.insert(0, os.path.join(ROOT, "..", "seo"))
import build_blog as bb  # noqa: E402  (importing does not run build(); guarded by __main__)

OUT = os.path.join(ROOT, "site")
DOCS = os.path.join(ROOT, "..", "..", "..", "user_docs")
IMG_SRC = os.path.join(DOCS, "img")
SITE = bb.SITE
LANGS = ["en", "pl", "de", "es", "fr", "ru", "ua", "be", "nl"]  # en = x-default
DEFAULT_LANG = "en"
THIN_WORDS = 250  # below this a help page is noindex,follow and dropped from the sitemap

# sections shown on the public help center — mirrors scripts/generate-help-content.js
# SECTIONS minus 00-index (which seeds the index page, not a standalone page)
SECTIONS = [
    "01-getting-started", "02-dashboard", "03-expenses-and-income", "04-voice-and-receipt",
    "05-budgets", "06-analytics", "07-ai-chat", "08-spending-story", "09-accounts",
    "10-wallet-and-exchange", "11-settings", "12-subscription", "13-gamification",
    "14-investments", "15-encryption", "16-export-reports", "17-debts-and-loans",
    "18-savings-goals", "19-fat-finder", "20-ai-response-mode", "21-widgets",
    "22-chat-bots", "23-scenario-simulator", "24-referral", "27-bank-import",
    "28-reference-data", "29-subscription-manager", "30-web-app", "31-anomaly-alerts",
]

HELP_NAV = {"en": "Help", "pl": "Pomoc", "de": "Hilfe", "es": "Ayuda", "fr": "Aide",
            "ru": "Помощь", "ua": "Довідка", "be": "Дапамога", "nl": "Help"}
# (indexTitle, indexDesc, indexH1, indexIntro, relatedHeading)
HELP_I18N = {
 "en": ("Help & Guides | AI Budget Assistant",
        "Step-by-step help for AI Budget Assistant: expenses, budgets, bank import, the AI assistant, encryption and more.",
        "Help & Guides", "How to use AI Budget Assistant, feature by feature.", "More help topics"),
 "pl": ("Pomoc i poradniki | AI Budget Assistant",
        "Pomoc krok po kroku: wydatki, budżety, import z banku, asystent AI, szyfrowanie i więcej.",
        "Pomoc i poradniki", "Jak korzystać z AI Budget Assistant, funkcja po funkcji.", "Więcej tematów pomocy"),
 "de": ("Hilfe & Anleitungen | AI Budget Assistant",
        "Schritt-für-Schritt-Hilfe: Ausgaben, Budgets, Bankimport, KI-Assistent, Verschlüsselung und mehr.",
        "Hilfe & Anleitungen", "So nutzt du AI Budget Assistant, Funktion für Funktion.", "Weitere Hilfethemen"),
 "es": ("Ayuda y guías | AI Budget Assistant",
        "Ayuda paso a paso: gastos, presupuestos, importación bancaria, asistente de IA, cifrado y más.",
        "Ayuda y guías", "Cómo usar AI Budget Assistant, función por función.", "Más temas de ayuda"),
 "fr": ("Aide et guides | AI Budget Assistant",
        "Aide pas à pas : dépenses, budgets, import bancaire, assistant IA, chiffrement et plus.",
        "Aide et guides", "Comment utiliser AI Budget Assistant, fonction par fonction.", "Plus de sujets d'aide"),
 "ru": ("Помощь и инструкции | AI Budget Assistant",
        "Пошаговая помощь: расходы, бюджеты, импорт из банка, ИИ-ассистент, шифрование и другое.",
        "Помощь и инструкции", "Как пользоваться AI Budget Assistant, функция за функцией.", "Другие темы помощи"),
 "ua": ("Довідка та інструкції | AI Budget Assistant",
        "Покрокова довідка: витрати, бюджети, імпорт з банку, ШІ-асистент, шифрування та інше.",
        "Довідка та інструкції", "Як користуватися AI Budget Assistant, функція за функцією.", "Інші теми довідки"),
 "be": ("Дапамога і інструкцыі | AI Budget Assistant",
        "Пакрокавая дапамога: выдаткі, бюджэты, імпарт з банка, ШІ-памочнік, шыфраванне і іншае.",
        "Дапамога і інструкцыі", "Як карыстацца AI Budget Assistant, функцыя за функцыяй.", "Іншыя тэмы дапамогі"),
 "nl": ("Help en handleidingen | AI Budget Assistant",
        "Stapsgewijze hulp: uitgaven, budgetten, bankimport, de AI-assistent, versleuteling en meer.",
        "Help en handleidingen", "Hoe je AI Budget Assistant gebruikt, functie voor functie.", "Meer help-onderwerpen"),
}

def slug_of(section):
    return re.sub(r"^\d+-", "", section)

VALID_SLUGS = {slug_of(s) for s in SECTIONS}
# legacy doc links that point at since-renamed/merged sections
LEGACY_SLUG = {"telegram-bot": "chat-bots", "whatsapp-bot": "chat-bots"}

def parse_doc(path):
    raw = open(path, encoding="utf-8").read()
    title, desc = "", ""
    for ln in raw.split("\n"):
        if ln.startswith("# "):
            title = ln[2:].strip(); break
    for ln in raw.split("\n"):
        if ln.startswith("> "):
            desc = ln[2:].strip(); break
    return title, desc, raw

def word_count(md):
    return len(re.findall(r"\S+", md))

def transform(body, lang):
    # images: ../img/X.jpg -> /help/assets/img/X.jpg
    body = re.sub(r"!\[([^\]]*)\]\(\.\./img/([^)]+)\)", r"![\1](/help/assets/img/\2)", body)
    # cross-doc links: ./NN-slug.md -> /help/<lang>/<slug>/ (00-index -> the index)
    def repl(m):
        text, target = m.group(1), m.group(2)
        s = slug_of(target)
        if target.startswith("00-index") or s == "index":
            return f"[{text}](/help/{lang}/)"
        s = LEGACY_SLUG.get(s, s)
        if s in VALID_SLUGS:
            return f"[{text}](/help/{lang}/{s}/)"
        return text  # unknown/removed section -> keep the words, drop the dead link
    return re.sub(r"\[([^\]]+)\]\(\./([0-9][^)]*)\.md\)", repl, body)

def help_jsonld(lang, title, desc, url, og_path):
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "TechArticle", "headline": title, "description": desc, "inLanguage": lang,
         "datePublished": bb.PUBLISH_DATE, "dateModified": bb.PUBLISH_DATE,
         "mainEntityOfPage": {"@type": "WebPage", "@id": url},
         "author": {"@type": "Organization", "name": "AI Budget Assistant"},
         "publisher": {"@type": "Organization", "name": bb.COMPANY, "url": bb.COMPANY_URL, "sameAs": bb.SAMEAS,
                       "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/mi_code_logo.svg"}},
         "image": f"{SITE}{og_path}"},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": bb.I18N[lang]["home"], "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": HELP_NAV[lang], "item": f"{SITE}/help/{lang}/"},
            {"@type": "ListItem", "position": 3, "name": title, "item": url}]}]}

def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)

    # collect docs that actually exist
    arts = []
    for lang in LANGS:
        for section in SECTIONS:
            p = os.path.join(DOCS, lang, f"{section}.md")
            if not os.path.isfile(p):
                continue
            title, desc, raw = parse_doc(p)
            if not title:
                continue
            arts.append({"lang": lang, "section": section, "slug": slug_of(section),
                         "title": title, "desc": desc, "raw": raw, "words": word_count(raw)})

    by_slug = {}
    for a in arts:
        by_slug.setdefault(a["slug"], []).append(a)

    # OG image per language + copy the screenshot folder once
    for lang in LANGS:
        bb.build_og(os.path.join(OUT, "help", lang, "assets", "og-default.png"), lang)
    if os.path.isdir(IMG_SRC):
        shutil.copytree(IMG_SRC, os.path.join(OUT, "help", "assets", "img"))

    indexable = []  # (lang, slug, title, desc) for sitemap + index cards

    # article pages
    for a in arts:
        lang, slug = a["lang"], a["slug"]
        url = f"{SITE}/help/{lang}/{slug}/"
        og = f"/help/{lang}/assets/og-default.png"
        title = f'{a["title"]} | AI Budget Assistant'
        desc = a["desc"] or a["title"]
        thin = a["words"] < THIN_WORDS
        robots = "noindex,follow" if thin else "index,follow,max-image-preview:large"
        # hreflang alternates: same slug across langs that have it
        peers = by_slug.get(slug, [])
        alts = [(x["lang"], f"{SITE}/help/{x['lang']}/{slug}/") for x in peers]
        xdef = next((u for l, u in alts if l == DEFAULT_LANG), alts[0][1] if alts else url)
        alts = alts + [("x-default", xdef)]
        alt_map = {l: u for l, u in alts if l != "x-default"}
        menu = bb.lang_menu(lang, alt_map, LANGS)
        ld = help_jsonld(lang, title, desc, url, og)
        body = bb.to_html(transform(a["raw"], lang))
        # related = other sections in the same language
        sibs = [x for x in arts if x["lang"] == lang and x["slug"] != slug]
        rel = "".join(f'<a href="/help/{lang}/{s["slug"]}/">{html.escape(s["title"])}</a>' for s in sibs)
        crumb = (f'<nav class="crumb"><a href="{bb.home_url(lang)}">{bb.I18N[lang]["home"]}</a> / '
                 f'<a href="/help/{lang}/">{HELP_NAV[lang]}</a></nav>')
        page = (bb.head(lang, title, desc, url, ld, alts, og, menu, robots=robots)
                + f'<main class="wrap">{crumb}<article>{body}</article>{bb.cta_block(lang)}'
                + f'<section class="related"><h2>{HELP_I18N[lang][4]}</h2>{rel}</section></main>'
                + bb.foot(lang))
        d = os.path.join(OUT, "help", lang, slug)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(page)
        if not thin:
            indexable.append((lang, slug, a["title"], desc))

    # per-language index
    for lang in LANGS:
        it, idesc, ih1, iintro, _ = HELP_I18N[lang]
        items = [a for a in arts if a["lang"] == lang]
        cards = "".join(
            f'<a class="card" href="/help/{lang}/{a["slug"]}/"><h2>{html.escape(a["title"])}</h2>'
            f'<p>{html.escape(a["desc"])}</p></a>' for a in items)
        url = f"{SITE}/help/{lang}/"
        alts = [(l, f"{SITE}/help/{l}/") for l in LANGS] + [("x-default", f"{SITE}/help/{DEFAULT_LANG}/")]
        alt_map = {l: f"/help/{l}/" for l in LANGS}
        menu = bb.lang_menu(lang, alt_map, LANGS)
        ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": it,
              "description": idesc, "inLanguage": lang, "url": url}
        crumb = f'<nav class="crumb"><a href="{bb.home_url(lang)}">{bb.I18N[lang]["home"]}</a> / {HELP_NAV[lang]}</nav>'
        page = (bb.head(lang, it, idesc, url, ld, alts, f"/help/{lang}/assets/og-default.png", menu, og_type="website")
                + f'<main class="wrap">{crumb}<h1>{html.escape(ih1)}</h1><p>{html.escape(iintro)}</p>'
                + f'{cards}{bb.cta_block(lang)}</main>' + bb.foot(lang))
        open(os.path.join(OUT, "help", lang, "index.html"), "w", encoding="utf-8", newline="\n").write(page)

    # /help/ dispatcher (noindex, NOT in sitemap)
    langs_js = json.dumps(LANGS)
    disp = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>Help - AI Budget Assistant</title>
<link rel="canonical" href="{SITE}/help/{DEFAULT_LANG}/">
<script>(function(){{var L={langs_js};var m={{uk:'ua'}};
var n=(navigator.language||'en').slice(0,2).toLowerCase();n=m[n]||n;
location.replace(L.indexOf(n)>=0?'/help/'+n+'/':'/help/{DEFAULT_LANG}/');}})();</script>
</head><body>
<p>Continue to help: <a href="/help/en/">English</a> | <a href="/help/pl/">Polski</a></p>
</body></html>"""
    os.makedirs(os.path.join(OUT, "help"), exist_ok=True)
    open(os.path.join(OUT, "help", "index.html"), "w", encoding="utf-8", newline="\n").write(disp)

    # sitemap (index pages + indexable articles only; dispatcher + thin pages excluded)
    urls = [(f"{SITE}/help/{l}/", "weekly", "0.6") for l in LANGS]
    urls += [(f"{SITE}/help/{l}/{s}/", "monthly", "0.5") for (l, s, _t, _d) in indexable]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, cf, pr in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{bb.PUBLISH_DATE}</lastmod><changefreq>{cf}</changefreq><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))

    thin_n = len(arts) - len(indexable)
    print(f"built {len(arts)} help pages in {len(LANGS)} langs ({','.join(LANGS)}); "
          f"{len(indexable)} indexable, {thin_n} thin(noindex) -> {OUT}")

if __name__ == "__main__":
    build()
