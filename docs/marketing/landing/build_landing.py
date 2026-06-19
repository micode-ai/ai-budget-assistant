# -*- coding: utf-8 -*-
"""
Build the static, SEO-optimized multi-language marketing landing for ai-budget.pl.

apex = this static landing (Polish default; others at /<lang>/). The Expo app
moves to https://app.ai-budget.pl. Blog stays at /blog.

Features:
- SEO: keyword-rich title/H1/intro per market, hreflang (+x-default=en), JSON-LD
  @graph (WebSite + Organization + SoftwareApplication + FAQPage), heading
  hierarchy, internal link to blog, static HTML + inline CSS.
- Clickable feature cards -> pure-CSS (:target) lightbox showing the per-language
  app screenshot (from feature_graphics/marketing/<lang>/, resized for web).
- Footer with the MICODE sp. z o.o. company logo + copyright (like eksiegowyai.pl).

BASE/ROBOTS gate the noindex /preview build vs the apex cutover:
  preview: LANDING_BASE=preview ROBOTS="noindex,follow"
  cutover: LANDING_BASE=""      ROBOTS="index,follow,max-image-preview:large"
"""
import os, json, html, shutil
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
FEAT = os.path.join(ROOT, "..", "feature_graphics", "by-language")  # clean raw screenshots (no headline plaque)
SITE = "https://ai-budget.pl"
APP = "https://app.ai-budget.pl"
PLAY = "https://play.google.com/store/apps/details?id=com.budget.assistant"
COMPANY = "MICODE sp. z o.o."
YEAR = "2026"
_b = os.environ.get("LANDING_BASE", "preview").strip("/")
BASE = ("/" + _b) if _b else ""
ROBOTS = os.environ.get("ROBOTS", "noindex,follow")
DEFAULT_LANG = "pl"
LOCALE = {"pl": "pl_PL", "en": "en_US", "de": "de_DE", "es": "es_ES", "fr": "fr_FR",
          "ru": "ru_RU", "ua": "uk_UA", "be": "be_BY", "nl": "nl_NL"}
LANG_NAMES = {"pl": "Polski", "en": "English", "de": "Deutsch", "es": "Español", "fr": "Français",
              "ru": "Русский", "ua": "Українська", "be": "Беларуская", "nl": "Nederlands"}

# Each feature: (title, description, screenshot-file in feature_graphics/marketing/<lang>/)
C = {
 "pl": {
   "title": "AI Budget Assistant - budżet domowy z asystentem AI",
   "desc": "Aplikacja do budżetu domowego z AI: dodawaj wydatki głosem lub zdjęciem paragonu, kontroluj budżety i oszczędności, wspólnie z rodziną. Zacznij za darmo.",
   "nav_blog": "Blog", "nav_login": "Zaloguj się",
   "hero_h1": "Budżet domowy z asystentem AI",
   "hero_sub": "Wydatki, budżety, oszczędności i wspólne finanse rodziny w jednej aplikacji. AI zajmuje się żmudną robotą za Ciebie. Zacznij za darmo.",
   "cta_primary": "Otwórz aplikację", "cta_secondary": "Pobierz z Google Play",
   "intro_title": "Kontrola wydatków bez Excela",
   "intro": "AI Budget Assistant to aplikacja do budżetu domowego, która łączy wydatki, budżety, cele oszczędnościowe, długi i import z banku w jednym miejscu. Zamiast ręcznie wpisywać każdy paragon, dodajesz wydatek głosem albo zdjęciem, a asystent AI odpowiada na pytania o Twoje finanse zwykłym językiem. Prowadź budżet sam lub wspólnie z rodziną, na żywo, na telefonie, tablecie i w przeglądarce.",
   "features_title": "Wszystko w jednej aplikacji",
   "features_hint": "Kliknij funkcję, aby zobaczyć ją w aplikacji",
   "see": "Zobacz w aplikacji",
   "features": [
     ("Asystent AI", "Dodawaj wydatki głosem lub zdjęciem paragonu i pytaj zwykłym językiem, ile wydałeś.", "02-ai-chat.png"),
     ("Wspólny budżet", "Jedno konto, cała rodzina widzi te same wydatki i budżet domowy na żywo.", "01-home.png"),
     ("Skan paragonów", "Zrób zdjęcie paragonu, a AI odczyta pozycje, kwotę i sprzedawcę.", "03-receipt-scan.png"),
     ("Budżety i cele", "Elastyczne budżety z historią, cele oszczędnościowe i śledzenie długów.", "05-budget-detail.png"),
     ("Analizy wydatków", "Trendy, podział na kategorie i sprzedawców oraz analizy AI.", "04-analytics.png"),
     ("Import z banku", "Wczytaj transakcje z Wise i banków (CSV lub PDF) z wykrywaniem duplikatów.", "06-bank-import.png"),
   ],
   "faq_title": "Najczęstsze pytania",
   "faq": [
     ("Czy aplikacja do budżetu jest darmowa?", "Tak, podstawowe funkcje są darmowe. Plan Pro zwiększa limity AI i odblokowuje zaawansowane analizy."),
     ("Jak dodawać wydatki?", "Głosem, zdjęciem paragonu albo ręcznie. Asystent AI rozpoznaje pozycje, kwotę i sprzedawcę."),
     ("Czy mogę prowadzić budżet domowy z rodziną?", "Tak. Wspólne konto sprawia, że wszyscy widzą te same wydatki i budżet w czasie rzeczywistym."),
     ("Czy zaimportuję transakcje z banku?", "Tak, z Wise i banków przez CSV lub PDF, z automatycznym wykrywaniem duplikatów."),
   ],
   "cta_band": "Przejmij kontrolę nad pieniędzmi, sam lub z rodziną.",
   "cta_band_btn": "Zacznij za darmo",
   "blog_cta": "Czytaj poradniki na blogu",
   "footer": "AI Budget Assistant - aplikacja do budżetu domowego z asystentem AI.",
   "rights": "Wszelkie prawa zastrzeżone.",
 },
 "en": {
   "title": "AI Budget Assistant - budget app & expense tracker",
   "desc": "AI budget app and expense tracker: add expenses by voice or a receipt photo, plan budgets and save money, together with your family. Free to start.",
   "nav_blog": "Blog", "nav_login": "Log in",
   "hero_h1": "Budget app and expense tracker with AI",
   "hero_sub": "Track expenses, plan budgets, hit savings goals and manage money together with your family, in one app. The AI does the boring work. Start free.",
   "cta_primary": "Open the app", "cta_secondary": "Get it on Google Play",
   "intro_title": "Expense tracking without spreadsheets",
   "intro": "AI Budget Assistant is an all-in-one budget app that brings expenses, budgets, savings goals, debts and bank import into one place. Instead of typing in every receipt, you add an expense by voice or a photo, and the AI answers questions about your money in plain language. Track it on your own or share one budget with your family in real time, on phone, tablet and web.",
   "features_title": "Everything in one app",
   "features_hint": "Tap a feature to see it in the app",
   "see": "See in the app",
   "features": [
     ("AI assistant", "Add expenses by voice or a photo of a receipt, and ask in plain language how much you spent.", "02-ai-chat.png"),
     ("Shared budget", "One account, the whole family sees the same expenses and household budget in real time.", "01-home.png"),
     ("Scan receipts", "Snap a receipt and the AI reads the items, total and merchant.", "03-receipt-scan.png"),
     ("Budgets and goals", "Flexible budgets with history, savings goals and debt tracking.", "05-budget-detail.png"),
     ("Spending analytics", "Trends, category and merchant breakdowns, and AI insights.", "04-analytics.png"),
     ("Bank import", "Import transactions from Wise and banks (CSV or PDF) with duplicate detection.", "06-bank-import.png"),
   ],
   "faq_title": "Frequently asked questions",
   "faq": [
     ("Is the budget app free?", "Yes, the core features are free. Pro raises the AI limits and unlocks advanced analytics."),
     ("How do I add expenses?", "By voice, a photo of a receipt, or manually. The AI reads the items, total and merchant."),
     ("Can I budget with my family?", "Yes. A shared account lets everyone see the same expenses and budget in real time."),
     ("Can I import bank transactions?", "Yes, from Wise and banks via CSV or PDF, with automatic duplicate detection."),
   ],
   "cta_band": "Take control of your money, on your own or together.",
   "cta_band_btn": "Start free",
   "blog_cta": "Read guides on the blog",
   "footer": "AI Budget Assistant - all-in-one finance app with an AI assistant.",
   "rights": "All rights reserved.",
 },
}

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1d;line-height:1.65}
a{text-decoration:none}.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
header{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #ececf0;z-index:10}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:800;font-size:19px;color:#1a1a1d}.brand span{color:#F58320}
.nav{display:flex;align-items:center;gap:18px}.nav a{color:#5b5b66;font-weight:600;font-size:15px}
.langs{display:flex;gap:8px}.langs a{font-size:13px;color:#9a9aa3}.langs a.active{color:#1a1a1d;font-weight:700}
.btn{display:inline-block;padding:11px 20px;border-radius:10px;font-weight:700;font-size:15px}
.btn.p{background:#F58320;color:#fff}.btn.s{background:#fff;color:#1a1a1d;border:1px solid #e3e3e8}
.hero{background:radial-gradient(900px 400px at 80% -10%,rgba(245,131,42,.18),transparent),linear-gradient(180deg,#fffaf4,#fff)}
.hero .wrap{padding:78px 22px 60px;text-align:center}
.hero h1{font-size:46px;line-height:1.12;margin:0 0 18px;letter-spacing:-.5px}
.hero p{font-size:20px;color:#4b4b55;max-width:700px;margin:0 auto 30px}.hero .btn{margin:6px}
.sec{padding:60px 0}.sec h2{text-align:center;font-size:30px;margin:0 0 8px}
.hint{text-align:center;color:#9a9aa3;font-size:14px;margin:0 0 30px}
.intro p{font-size:18px;color:#3a3a42;max-width:760px;margin:18px auto 0;text-align:center}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
@media(max-width:760px){.grid{grid-template-columns:1fr}.hero h1{font-size:34px}.hero p{font-size:17px}}
.card{display:block;padding:24px;border:1px solid #ececf0;border-radius:16px;background:#fff;transition:.15s;color:inherit}
.card:hover{border-color:#F58320;box-shadow:0 8px 24px rgba(245,131,42,.12);transform:translateY(-2px)}
.card .ic{width:42px;height:42px;border-radius:11px;background:#fff3e6;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.card .ic b{color:#F58320;font-size:20px}.card h3{margin:0 0 8px;font-size:18px}.card p{margin:0;color:#5b5b66;font-size:15px}
.card .see{display:inline-block;margin-top:12px;color:#c96a12;font-weight:700;font-size:14px}
.faq{max-width:760px;margin:30px auto 0}.faq .qa{padding:18px 0;border-bottom:1px solid #ececf0}
.faq h3{margin:0 0 6px;font-size:18px}.faq p{margin:0;color:#5b5b66;font-size:16px}
.blogcta{text-align:center;padding:0 0 60px}.blogcta a{color:#c96a12;font-weight:700;font-size:16px}
.band{background:#1a1a1d;color:#fff;text-align:center}.band .wrap{padding:56px 22px}.band h2{font-size:28px;margin:0 0 22px}
footer{border-top:1px solid #ececf0;background:#fafafb;color:#8a8a93;font-size:14px;text-align:center}
footer .wrap{padding:30px 22px;display:flex;flex-direction:column;align-items:center;gap:16px}
.f-links{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}.f-links a{color:#5b5b66;font-weight:600}
.f-co{display:flex;align-items:center;justify-content:center;gap:12px;border-top:1px solid #ececf0;padding-top:16px;width:100%}
.f-co img{height:30px;width:30px}
.langmenu{position:relative}.langmenu>summary{list-style:none;cursor:pointer;color:#5b5b66;font-weight:600;font-size:15px}
.langmenu>summary::-webkit-details-marker{display:none}
.langlist{position:absolute;top:150%;right:0;background:#fff;border:1px solid #ececf0;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.12);padding:6px;min-width:170px;z-index:20}
.langlist a{display:block;padding:9px 12px;border-radius:8px;color:#3a3a42;font-size:14px;font-weight:600}
.langlist a:hover{background:#fff3e6}.langlist a.active{color:#F58320}
.lbcb{position:absolute;width:0;height:0;opacity:0;overflow:hidden}
.lb{display:none;position:fixed;inset:0;background:rgba(10,10,12,.82);z-index:50;align-items:center;justify-content:center;padding:24px}
.lbcb:checked + .lb{display:flex}.lb .bg{position:absolute;inset:0;cursor:default}
.lb img{position:relative;max-height:86vh;max-width:360px;width:100%;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.lb .x{position:absolute;top:16px;right:22px;color:#fff;font-size:34px;font-weight:700;z-index:2;cursor:pointer;line-height:1}
"""

def lp(lang):
    if lang == DEFAULT_LANG:
        return f"{BASE}/" if BASE else "/"
    return f"{BASE}/{lang}/"

def jsonld(lang, langs):
    t = C[lang]; url = SITE + lp(lang)
    og = f"{SITE}/blog/{lang if lang in ('en','pl') else 'en'}/assets/og-default.png"
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "name": "AI Budget Assistant", "url": url, "inLanguage": lang},
        {"@type": "Organization", "name": COMPANY, "url": SITE, "logo": {"@type": "ImageObject", "url": f"{SITE}{BASE}/assets/mi_code_logo.svg"}},
        {"@type": "SoftwareApplication", "name": "AI Budget Assistant", "applicationCategory": "FinanceApplication",
         "operatingSystem": "Android, Web", "inLanguage": lang, "url": url, "image": og,
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in t["faq"]]},
    ]}

def head(lang, langs):
    t = C[lang]; url = SITE + lp(lang)
    alts = "".join(f'<link rel="alternate" hreflang="{l}" href="{SITE+lp(l)}">' for l in langs)
    alts += f'<link rel="alternate" hreflang="x-default" href="{SITE + (lp("en") if "en" in langs else lp(lang))}">'
    og = f"{SITE}/blog/{lang if lang in ('en','pl') else 'en'}/assets/og-default.png"
    return f"""<!DOCTYPE html><html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(t['title'])}</title>
<meta name="description" content="{html.escape(t['desc'])}">
<link rel="canonical" href="{url}"><meta name="robots" content="{ROBOTS}">
<meta property="og:type" content="website"><meta property="og:site_name" content="AI Budget Assistant">
<meta property="og:locale" content="{LOCALE[lang]}"><meta property="og:title" content="{html.escape(t['title'])}">
<meta property="og:description" content="{html.escape(t['desc'])}"><meta property="og:url" content="{url}"><meta property="og:image" content="{og}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{html.escape(t['title'])}">
<meta name="twitter:description" content="{html.escape(t['desc'])}"><meta name="twitter:image" content="{og}">
{alts}
<script type="application/ld+json">{json.dumps(jsonld(lang, langs), ensure_ascii=False)}</script>
<style>{CSS}</style></head><body>"""

def page(lang, langs):
    t = C[lang]
    blog = f"/blog/{lang if lang in ('en','pl') else 'en'}/"
    langlinks = "".join(f'<a class="{"active" if l==lang else ""}" href="{lp(l)}">{LANG_NAMES[l]}</a>' for l in langs)
    langmenu = f'<details class="langmenu"><summary>{LANG_NAMES[lang]} &#9662;</summary><div class="langlist">{langlinks}</div></details>'
    cards, lbs = "", ""
    for i, (h, p, shot) in enumerate(t["features"]):
        cid = f"cb{i+1}"
        cards += (f'<label class="card" for="{cid}"><div class="ic"><b>{i+1}</b></div>'
                  f'<h3>{html.escape(h)}</h3><p>{html.escape(p)}</p>'
                  f'<span class="see">{html.escape(t["see"])} &rarr;</span></label>')
        lbs += (f'<input class="lbcb" type="checkbox" id="{cid}">'
                f'<div class="lb"><label class="bg" for="{cid}"></label><label class="x" for="{cid}">&times;</label>'
                f'<img loading="lazy" src="{BASE}/assets/screens/{lang}/{shot}" alt="{html.escape(h)} - AI Budget Assistant"></div>')
    faq = "".join(f'<div class="qa"><h3>{html.escape(q)}</h3><p>{html.escape(a)}</p></div>' for q, a in t["faq"])
    return (head(lang, langs)
        + f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
          f'<nav class="nav">{langmenu}<a href="{blog}">{t["nav_blog"]}</a>'
          f'<a class="btn p" href="{APP}">{t["nav_login"]}</a></nav></div></header>'
        + f'<section class="hero"><div class="wrap"><h1>{html.escape(t["hero_h1"])}</h1>'
          f'<p>{html.escape(t["hero_sub"])}</p><a class="btn p" href="{APP}">{t["cta_primary"]}</a>'
          f'<a class="btn s" href="{PLAY}">{t["cta_secondary"]}</a></div></section>'
        + f'<section class="sec intro"><div class="wrap"><h2>{html.escape(t["intro_title"])}</h2>'
          f'<p>{html.escape(t["intro"])}</p></div></section>'
        + f'<section class="sec"><div class="wrap"><h2>{html.escape(t["features_title"])}</h2>'
          f'<p class="hint">{html.escape(t["features_hint"])}</p><div class="grid">{cards}</div></div></section>'
        + f'<section class="sec"><div class="wrap"><h2>{html.escape(t["faq_title"])}</h2><div class="faq">{faq}</div></div></section>'
        + f'<div class="blogcta"><a href="{blog}">{t["blog_cta"]} &rarr;</a></div>'
        + f'<section class="band"><div class="wrap"><h2>{html.escape(t["cta_band"])}</h2>'
          f'<a class="btn p" href="{APP}">{t["cta_band_btn"]}</a></div></section>'
        + f'<footer><div class="wrap"><div class="f-links"><a href="{blog}">{t["nav_blog"]}</a>'
          f'<a href="{APP}">{t["nav_login"]}</a><a href="{PLAY}">Google Play</a></div>'
          f'<div class="f-co"><img src="{BASE}/assets/mi_code_logo.svg" alt="{COMPANY}" width="30" height="30">'
          f'<span>&copy; {YEAR} AI Budget Assistant &mdash; {COMPANY}. {html.escape(t["rights"])}</span></div></div></footer>'
        + lbs + '</body></html>')

def copy_assets(langs):
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(OUT, "assets"), dirs_exist_ok=True)
    for lang in langs:
        dst = os.path.join(OUT, "assets", "screens", lang)
        os.makedirs(dst, exist_ok=True)
        for shot in {s for _, _, s in C[lang]["features"]}:
            src = os.path.join(FEAT, lang, os.path.splitext(shot)[0] + ".jpg")
            if not os.path.exists(src):
                print("  MISSING screenshot:", lang, shot); continue
            img = Image.open(src).convert("RGB")
            nw = 540; nh = round(img.height * nw / img.width)
            img.resize((nw, nh), Image.LANCZOS).save(os.path.join(dst, shot), "PNG", optimize=True)

def build():
    shutil.rmtree(OUT, ignore_errors=True)
    langs = list(C.keys())
    copy_assets(langs)
    for lang in langs:
        d = OUT if lang == DEFAULT_LANG else os.path.join(OUT, lang)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(page(lang, langs))
    print(f"built SEO landing for {len(langs)} langs ({','.join(langs)}) BASE='{BASE}' ROBOTS='{ROBOTS}' -> {OUT}")

if __name__ == "__main__":
    build()
