# -*- coding: utf-8 -*-
"""
Build static, crawlable, MULTILINGUAL HTML blog pages from the SEO markdown.

ai-budget.pl apex is a static landing; this blog lives at /blog and shares the
landing's header (brand + language dropdown + Log in -> app.ai-budget.pl) and
footer (MICODE sp. z o.o. logo).

SEO-safe i18n: each language at /blog/<lang>/<slug>/ + /blog/<lang>/; hreflang
pairs articles by the `pair` frontmatter key (x-default = en); sitemap lists every
language URL; /blog/ is a noindex JS dispatcher (navigator.language) NOT in sitemap.

Sources: docs/marketing/seo/*.md (pl) + docs/marketing/seo/<lang>/*.md (en/de/...);
lang/pair/slug come from frontmatter. Run: python build_blog.py
"""
import os, re, json, html, glob, shutil
import markdown as md_lib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
SITE = "https://ai-budget.pl"
APP = "https://app.ai-budget.pl"
PLAY = "https://play.google.com/store/apps/details?id=com.budget.assistant"
COMPANY = "MICODE sp. z o.o."
YEAR = "2026"
PUBLISH_DATE = "2026-06-19"
DEFAULT_LANG = "en"  # x-default
LOCALE = {"pl": "pl_PL", "en": "en_US", "de": "de_DE", "es": "es_ES", "fr": "fr_FR",
          "ru": "ru_RU", "ua": "uk_UA", "be": "be_BY", "nl": "nl_NL"}
LANG_NAMES = {"pl": "Polski", "en": "English", "de": "Deutsch", "es": "Español", "fr": "Français",
              "ru": "Русский", "ua": "Українська", "be": "Беларуская", "nl": "Nederlands"}

I18N = {
 "en": {"home": "Home", "blog": "Blog", "login": "Log in",
   "blogTitle": "Personal finance blog | AI Budget Assistant",
   "blogDesc": "Practical guides on budgeting, expense tracking and saving money with an AI assistant.",
   "blogH1": "Blog", "blogIntro": "Guides on personal finance, budgeting and saving money.",
   "related": "Related articles", "ctaTitle": "Manage your money with AI",
   "ctaText": "Add expenses by voice or a photo of a receipt, track budgets and savings, together with your family. Start free.",
   "btnWeb": "Open the app", "btnPlay": "Get it on Google Play",
   "footer": "AI Budget Assistant - all-in-one finance app with an AI assistant.", "rights": "All rights reserved."},
 "pl": {"home": "Strona główna", "blog": "Blog", "login": "Zaloguj się",
   "blogTitle": "Blog o budżecie domowym i oszczędzaniu | AI Budget Assistant",
   "blogDesc": "Praktyczne poradniki: jak prowadzić budżet domowy, kontrolować wydatki i oszczędzać pieniądze.",
   "blogH1": "Blog", "blogIntro": "Poradniki o finansach osobistych, budżecie domowym i oszczędzaniu.",
   "related": "Powiązane artykuły", "ctaTitle": "Prowadź budżet domowy z AI",
   "ctaText": "Dodawaj wydatki głosem lub zdjęciem paragonu, śledź budżety i oszczędności, wspólnie z rodziną. Zacznij za darmo.",
   "btnWeb": "Otwórz aplikację", "btnPlay": "Pobierz z Google Play",
   "footer": "AI Budget Assistant - aplikacja do budżetu domowego z asystentem AI.", "rights": "Wszelkie prawa zastrzeżone."},
 "de": {"home": "Startseite", "blog": "Blog", "login": "Anmelden",
   "blogTitle": "Blog über Haushaltsbuch und Sparen | AI Budget Assistant",
   "blogDesc": "Praktische Ratgeber: Haushaltsbuch führen, Ausgaben tracken und Geld sparen mit einem KI-Assistenten.",
   "blogH1": "Blog", "blogIntro": "Ratgeber zu persönlichen Finanzen, Haushaltsbuch und Sparen.",
   "related": "Ähnliche Artikel", "ctaTitle": "Verwalte dein Geld mit KI",
   "ctaText": "Erfasse Ausgaben per Sprache oder Beleg-Foto, behalte Budgets und Sparen im Blick, gemeinsam mit der Familie. Kostenlos starten.",
   "btnWeb": "App öffnen", "btnPlay": "Bei Google Play laden",
   "footer": "AI Budget Assistant - All-in-one Finanz-App mit KI-Assistent.", "rights": "Alle Rechte vorbehalten."},
 "es": {"home": "Inicio", "blog": "Blog", "login": "Iniciar sesión",
   "blogTitle": "Blog sobre presupuesto y ahorro | AI Budget Assistant",
   "blogDesc": "Guías prácticas: cómo hacer un presupuesto, controlar gastos y ahorrar dinero con un asistente de IA.",
   "blogH1": "Blog", "blogIntro": "Guías sobre finanzas personales, presupuesto y ahorro.",
   "related": "Artículos relacionados", "ctaTitle": "Gestiona tu dinero con IA",
   "ctaText": "Añade gastos por voz o foto del recibo, controla presupuestos y ahorro, en familia. Empieza gratis.",
   "btnWeb": "Abrir la app", "btnPlay": "Descargar en Google Play",
   "footer": "AI Budget Assistant - app de finanzas todo en uno con asistente de IA.", "rights": "Todos los derechos reservados."},
 "fr": {"home": "Accueil", "blog": "Blog", "login": "Se connecter",
   "blogTitle": "Blog sur le budget et l'épargne | AI Budget Assistant",
   "blogDesc": "Guides pratiques : faire un budget, suivre ses dépenses et économiser avec un assistant IA.",
   "blogH1": "Blog", "blogIntro": "Guides sur les finances personnelles, le budget et l'épargne.",
   "related": "Articles similaires", "ctaTitle": "Gérez votre argent avec l'IA",
   "ctaText": "Ajoutez des dépenses à la voix ou par photo de reçu, suivez budgets et épargne, en famille. Commencez gratuitement.",
   "btnWeb": "Ouvrir l'appli", "btnPlay": "Télécharger sur Google Play",
   "footer": "AI Budget Assistant - appli de finances tout-en-un avec assistant IA.", "rights": "Tous droits réservés."},
 "ru": {"home": "Главная", "blog": "Блог", "login": "Войти",
   "blogTitle": "Блог о бюджете и экономии | AI Budget Assistant",
   "blogDesc": "Практические гайды: как вести бюджет, учитывать расходы и экономить деньги с ИИ-ассистентом.",
   "blogH1": "Блог", "blogIntro": "Гайды о личных финансах, бюджете и экономии.",
   "related": "Похожие статьи", "ctaTitle": "Управляйте деньгами с ИИ",
   "ctaText": "Добавляйте расходы голосом или фото чека, следите за бюджетами и накоплениями, вместе с семьёй. Начните бесплатно.",
   "btnWeb": "Открыть приложение", "btnPlay": "Скачать в Google Play",
   "footer": "AI Budget Assistant - всё-в-одном приложение для финансов с ИИ-ассистентом.", "rights": "Все права защищены."},
 "ua": {"home": "Головна", "blog": "Блог", "login": "Увійти",
   "blogTitle": "Блог про бюджет та заощадження | AI Budget Assistant",
   "blogDesc": "Практичні гайди: як вести бюджет, обліковувати витрати та заощаджувати з ШІ-асистентом.",
   "blogH1": "Блог", "blogIntro": "Гайди про особисті фінанси, бюджет та заощадження.",
   "related": "Схожі статті", "ctaTitle": "Керуйте грошима з ШІ",
   "ctaText": "Додавайте витрати голосом або фото чека, стежте за бюджетами та заощадженнями, разом із родиною. Почніть безкоштовно.",
   "btnWeb": "Відкрити застосунок", "btnPlay": "Завантажити в Google Play",
   "footer": "AI Budget Assistant - все-в-одному застосунок для фінансів із ШІ-асистентом.", "rights": "Усі права захищено."},
 "be": {"home": "Галоўная", "blog": "Блог", "login": "Увайсці",
   "blogTitle": "Блог пра бюджэт і эканомію | AI Budget Assistant",
   "blogDesc": "Практычныя гайды: як весці бюджэт, улічваць выдаткі і эканоміць з ШІ-памочнікам.",
   "blogH1": "Блог", "blogIntro": "Гайды пра асабістыя фінансы, бюджэт і эканомію.",
   "related": "Падобныя артыкулы", "ctaTitle": "Кіруйце грашыма з ШІ",
   "ctaText": "Дадавайце выдаткі голасам або фота чэка, сачыце за бюджэтамі і зберажэннямі, разам з сям'ёй. Пачніце бясплатна.",
   "btnWeb": "Адкрыць дадатак", "btnPlay": "Спампаваць у Google Play",
   "footer": "AI Budget Assistant - усё-ў-адным дадатак для фінансаў з ШІ-памочнікам.", "rights": "Усе правы абаронены."},
 "nl": {"home": "Home", "blog": "Blog", "login": "Inloggen",
   "blogTitle": "Blog over budget en sparen | AI Budget Assistant",
   "blogDesc": "Praktische gidsen: een budget maken, uitgaven bijhouden en geld besparen met een AI-assistent.",
   "blogH1": "Blog", "blogIntro": "Gidsen over persoonlijke financiën, budget en sparen.",
   "related": "Gerelateerde artikelen", "ctaTitle": "Beheer je geld met AI",
   "ctaText": "Voeg uitgaven toe met spraak of een bonfoto, volg budgetten en sparen, samen met je gezin. Gratis te starten.",
   "btnWeb": "App openen", "btnPlay": "Download in Google Play",
   "footer": "AI Budget Assistant - alles-in-één finance-app met een AI-assistent.", "rights": "Alle rechten voorbehouden."},
}
OG_TEXT = {
    "en": ("Budget with an", "AI assistant", "Expenses, budgets, savings - with your family"),
    "pl": ("Budżet domowy", "z asystentem AI", "Wydatki, budżety, oszczędności - z rodziną"),
}

CSS = """
:root{--o:#F58320;--ink:#1a1a1d;--mut:#5b5b66;--line:#ececf0;--bg:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.7}
.wrap{max-width:760px;margin:0 auto;padding:0 22px}
header.site{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);z-index:10}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{font-weight:800;color:var(--ink);text-decoration:none;font-size:18px}.brand span{color:var(--o)}
.nav{display:flex;align-items:center;gap:16px}.nav>a{color:var(--mut);font-weight:600;font-size:15px;text-decoration:none}
.btn-login{color:#fff!important;background:var(--o);padding:8px 14px;border-radius:8px}
.langmenu{position:relative}.langmenu>summary{list-style:none;cursor:pointer;color:var(--mut);font-weight:600;font-size:15px}
.langmenu>summary::-webkit-details-marker{display:none}
.langlist{position:absolute;top:150%;right:0;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.12);padding:6px;min-width:170px;z-index:20}
.langlist a{display:block;padding:9px 12px;border-radius:8px;color:#3a3a42;font-size:14px;font-weight:600;text-decoration:none}
.langlist a:hover{background:#fff3e6}.langlist a.active{color:var(--o)}
nav.crumb{font-size:13px;color:var(--mut);padding:16px 0}nav.crumb a{color:var(--mut)}
article h1{font-size:32px;line-height:1.25;margin:8px 0 16px}
article h2{font-size:23px;margin:34px 0 10px}article h3{font-size:18px;margin:24px 0 8px}
article p,article li{font-size:17px;color:#27272e}article a{color:#c96a12}article ul{padding-left:22px}
hr{border:0;border-top:1px solid var(--line);margin:32px 0}
.cta{margin:36px 0;padding:22px;border:1px solid var(--line);border-radius:14px;background:#fffaf4}
.cta h3{margin:0 0 6px}.cta p{margin:0 0 14px;color:var(--mut);font-size:15px}
.btn{display:inline-block;margin:4px 8px 4px 0;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px}
.btn.p{background:var(--o);color:#fff}.btn.s{background:#fff;color:var(--ink);border:1px solid #e3e3e8}
.related{margin:36px 0}.related h2{font-size:20px}
.related a{display:block;padding:12px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink);font-weight:600}
.card{display:block;padding:18px 0;border-bottom:1px solid var(--line);text-decoration:none}
.card h2{margin:0 0 6px;font-size:21px;color:var(--ink)}.card p{margin:0;color:var(--mut);font-size:15px}
footer.site{border-top:1px solid var(--line);background:#fafafb;color:#8a8a93;font-size:14px;text-align:center;margin-top:48px}
footer.site .wrap{padding:30px 22px;display:flex;flex-direction:column;align-items:center;gap:16px}
.f-links{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}.f-links a{color:var(--mut);font-weight:600;text-decoration:none}
.f-co{display:flex;align-items:center;justify-content:center;gap:12px;border-top:1px solid var(--line);padding-top:16px;width:100%}
.f-co img{height:30px;width:30px}
"""

def parse(path):
    raw = open(path, encoding="utf-8").read()
    meta, body = {}, raw
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"').strip("'")
        body = m.group(2)
    return meta, body

def to_html(body):
    return md_lib.markdown(body, extensions=["extra", "sane_lists", "smarty"])

_QLINE = re.compile(r"^\*\*(.+\?)\*\*\s*$")

def _plain(t):
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)  # strip markdown links -> text
    return t.replace("**", "").replace("*", "").strip()

def extract_faq(body):
    """Pull Q&A from the FAQ section (the H2 section with the most bold-question lines)."""
    sections, cur = [], []
    for ln in body.split("\n"):
        if ln.startswith("## "):
            if cur:
                sections.append(cur)
            cur = [ln]
        else:
            cur.append(ln)
    if cur:
        sections.append(cur)
    best, best_n = None, 1
    for sec in sections:
        n = sum(1 for ln in sec if _QLINE.match(ln.strip()))
        if n >= best_n:
            best, best_n = sec, n
    if not best:
        return []
    pairs, q, ans = [], None, []
    for ln in best:
        s = ln.strip()
        m = _QLINE.match(s)
        if m:
            if q and ans:
                pairs.append((_plain(q), _plain(" ".join(ans))))
            q, ans = m.group(1), []
        elif s.startswith("##") or s.startswith("---") or s.lower().startswith("*related") or s.lower().startswith("_related"):
            if q and ans:
                pairs.append((_plain(q), _plain(" ".join(ans))))
            q, ans = None, []
        elif s and q:
            ans.append(s)
    if q and ans:
        pairs.append((_plain(q), _plain(" ".join(ans))))
    return [(q, a) for q, a in pairs if q and a]

def lang_menu(lang, alt_map, langs):
    links = "".join(
        f'<a class="{"active" if l == lang else ""}" href="{alt_map.get(l, f"/blog/{l}/")}">{LANG_NAMES[l]}</a>'
        for l in langs)
    return (f'<details class="langmenu"><summary>{LANG_NAMES[lang]} &#9662;</summary>'
            f'<div class="langlist">{links}</div></details>')

def head(lang, title, desc, url, jsonld, alternates, og_path, langmenu, og_type="article",
         robots="index,follow,max-image-preview:large"):
    alt_tags = "\n".join(f'<link rel="alternate" hreflang="{hl}" href="{href}">' for hl, href in alternates)
    t = I18N[lang]
    return f"""<!DOCTYPE html>
<html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}"><meta name="robots" content="{robots}">
<meta property="og:type" content="{og_type}"><meta property="og:site_name" content="AI Budget Assistant">
<meta property="og:locale" content="{LOCALE[lang]}"><meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}{og_path}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}"><meta name="twitter:image" content="{SITE}{og_path}">
{alt_tags}
<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>
<style>{CSS}</style></head><body>
<header class="site"><div class="wrap"><a class="brand" href="/">AI <span>Budget</span> Assistant</a>
<nav class="nav">{langmenu}<a href="/blog/{lang}/">{t['blog']}</a><a class="btn-login" href="{APP}">{t['login']}</a></nav></div></header>
"""

def foot(lang):
    t = I18N[lang]
    return (f'<footer class="site"><div class="wrap">'
            f'<div class="f-links"><a href="/blog/{lang}/">{t["blog"]}</a>'
            f'<a href="{APP}">{t["login"]}</a><a href="{PLAY}">Google Play</a></div>'
            f'<div class="f-co"><img src="/assets/mi_code_logo.svg" alt="{COMPANY}" width="30" height="30">'
            f'<span>&copy; {YEAR} AI Budget Assistant &mdash; {COMPANY}. {html.escape(t["rights"])}</span></div>'
            f'</div></footer>\n</body></html>')

def cta_block(lang):
    t = I18N[lang]
    return (f'<aside class="cta"><h3>{t["ctaTitle"]}</h3><p>{t["ctaText"]}</p>'
            f'<a class="btn p" href="{APP}">{t["btnWeb"]}</a>'
            f'<a class="btn s" href="{PLAY}">{t["btnPlay"]}</a></aside>')

def article_jsonld(lang, title, desc, url, og_path):
    t = I18N[lang]
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": title, "description": desc, "inLanguage": lang,
         "datePublished": PUBLISH_DATE, "dateModified": PUBLISH_DATE,
         "mainEntityOfPage": {"@type": "WebPage", "@id": url},
         "author": {"@type": "Organization", "name": "AI Budget Assistant"},
         "publisher": {"@type": "Organization", "name": COMPANY,
                       "logo": {"@type": "ImageObject", "url": f"{SITE}/assets/mi_code_logo.svg"}},
         "image": f"{SITE}{og_path}"},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": t["home"], "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": t["blog"], "item": f"{SITE}/blog/{lang}/"},
            {"@type": "ListItem", "position": 3, "name": title, "item": url}]}]}

def build_og(path, lang):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (24, 16, 9))
    d = ImageDraw.Draw(img)
    for y in range(H):
        tt = y / H
        d.line([(0, y), (W, y)], fill=(int(40 - 16 * tt), int(26 - 12 * tt), int(14 - 6 * tt)))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([700, -150, 1400, 480], fill=(245, 131, 42, 150))
    img = Image.alpha_composite(img.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(160))).convert("RGB")
    d = ImageDraw.Draw(img)
    try:
        bold = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 70)
        reg = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 34)
        brand = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 30)
    except OSError:
        bold = reg = brand = ImageFont.load_default()
    l1, l2, sub = OG_TEXT.get(lang, OG_TEXT["en"])
    d.rounded_rectangle([80, 70, 170, 80], radius=5, fill=(245, 131, 42))
    d.text((80, 110), "AI Budget Assistant", font=brand, fill=(245, 131, 42))
    d.text((80, 250), l1, font=bold, fill=(250, 250, 252))
    d.text((80, 330), l2, font=bold, fill=(250, 250, 252))
    d.text((80, 470), sub, font=reg, fill=(205, 205, 212))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")

def read_articles():
    arts = []
    paths = glob.glob(os.path.join(ROOT, "*.md")) + glob.glob(os.path.join(ROOT, "*", "*.md"))
    for path in sorted(paths):
        if os.sep + "site" + os.sep in path:
            continue
        meta, body = parse(path)
        if not meta.get("slug") or not meta.get("lang") or not meta.get("pair"):
            continue
        arts.append({"m": meta, "body": body, "lang": meta["lang"]})
    return arts

def url_for(a):
    return f"{SITE}/blog/{a['lang']}/{a['m']['slug']}/"

def alternates_for_pair(by_pair, pair):
    alts = [(a["lang"], url_for(a)) for a in by_pair.get(pair, [])]
    xdef = next((u for l, u in alts if l == DEFAULT_LANG), alts[0][1] if alts else f"{SITE}/blog/")
    return alts + [("x-default", xdef)]

def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    arts = read_articles()
    langs = [l for l in LANG_NAMES if any(a["lang"] == l for a in arts)]  # ordered, present only
    by_pair = {}
    for a in arts:
        by_pair.setdefault(a["m"]["pair"], []).append(a)

    for lang in langs:
        build_og(os.path.join(OUT, "blog", lang, "assets", "og-default.png"), lang)

    # article pages
    for a in arts:
        lang, m = a["lang"], a["m"]
        url = url_for(a)
        og = f"/blog/{lang}/assets/og-default.png"
        title, desc = m.get("title", m["slug"]), m.get("meta_description", "")
        alts = alternates_for_pair(by_pair, m["pair"])
        alt_map = {l: u for l, u in alts if l != "x-default"}
        menu = lang_menu(lang, alt_map, langs)
        siblings = [x for x in arts if x["lang"] == lang and x is not a]
        rel = "".join(f'<a href="/blog/{lang}/{s["m"]["slug"]}/">{html.escape(s["m"].get("title", ""))}</a>'
                      for s in siblings)
        t = I18N[lang]
        ld = article_jsonld(lang, title, desc, url, og)
        faq = extract_faq(a["body"])
        if len(faq) >= 2:
            ld["@graph"].append({"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in faq]})
        page = (head(lang, title, desc, url, ld, alts, og, menu)
                + f'<main class="wrap"><nav class="crumb"><a href="/">{t["home"]}</a> / <a href="/blog/{lang}/">{t["blog"]}</a></nav>'
                + f'<article>{to_html(a["body"])}</article>{cta_block(lang)}'
                + f'<section class="related"><h2>{t["related"]}</h2>{rel}</section></main>' + foot(lang))
        d = os.path.join(OUT, "blog", lang, m["slug"])
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(page)

    # per-language index
    for lang in langs:
        t = I18N[lang]
        items = [a for a in arts if a["lang"] == lang]
        cards = "".join(f'<a class="card" href="/blog/{lang}/{a["m"]["slug"]}/"><h2>{html.escape(a["m"].get("title", ""))}</h2>'
                        f'<p>{html.escape(a["m"].get("meta_description", ""))}</p></a>' for a in items)
        url = f"{SITE}/blog/{lang}/"
        alts = [(l, f"{SITE}/blog/{l}/") for l in langs] + [("x-default", f"{SITE}/blog/{DEFAULT_LANG}/")]
        alt_map = {l: f"/blog/{l}/" for l in langs}
        menu = lang_menu(lang, alt_map, langs)
        ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": t["blogTitle"], "inLanguage": lang, "url": url}
        page = (head(lang, t["blogTitle"], t["blogDesc"], url, ld, alts, f"/blog/{lang}/assets/og-default.png", menu, og_type="website")
                + f'<main class="wrap"><nav class="crumb"><a href="/">{t["home"]}</a> / {t["blog"]}</nav>'
                + f'<h1>{t["blogH1"]}</h1><p>{t["blogIntro"]}</p>{cards}{cta_block(lang)}</main>' + foot(lang))
        open(os.path.join(OUT, "blog", lang, "index.html"), "w", encoding="utf-8", newline="\n").write(page)

    # /blog/ language dispatcher (noindex, not in sitemap)
    langs_js = json.dumps(langs)
    disp = f"""<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>Blog - AI Budget Assistant</title>
<link rel="canonical" href="{SITE}/blog/{DEFAULT_LANG}/">
<script>(function(){{var L={langs_js};var m={{uk:'ua'}};
var n=(navigator.language||'en').slice(0,2).toLowerCase();n=m[n]||n;
location.replace(L.indexOf(n)>=0?'/blog/'+n+'/':'/blog/{DEFAULT_LANG}/');}})();</script>
</head><body>
<p>Continue to the blog: <a href="/blog/en/">English</a> | <a href="/blog/pl/">Polski</a></p>
</body></html>"""
    os.makedirs(os.path.join(OUT, "blog"), exist_ok=True)
    open(os.path.join(OUT, "blog", "index.html"), "w", encoding="utf-8", newline="\n").write(disp)

    # sitemap (NOT the dispatcher) + robots
    urls = [(f"{SITE}/", "weekly", "1.0")]
    for lang in langs:
        urls.append((f"{SITE}/blog/{lang}/", "weekly", "0.8"))
    for a in arts:
        urls.append((url_for(a), "monthly", "0.7"))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, cf, pr in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{PUBLISH_DATE}</lastmod><changefreq>{cf}</changefreq><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))
    open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8", newline="\n").write(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

    print(f"built {len(arts)} articles in {len(langs)} langs ({','.join(langs)}) -> {OUT}")

if __name__ == "__main__":
    build()
