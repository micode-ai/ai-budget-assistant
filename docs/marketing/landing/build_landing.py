# -*- coding: utf-8 -*-
"""
Build the static multi-language marketing landing for ai-budget.pl.

Mirrors the blog approach: real crawlable HTML per language, hreflang, sitemap.
The Expo SPA (the actual app) moves to https://app.ai-budget.pl; this landing
takes over the apex. Polish is the apex default; other languages at /<lang>/.

BASE/ROBOTS let us deploy a noindex preview under /preview before the apex cutover:
  preview:  BASE="/preview"  ROBOTS="noindex,follow"
  final:    BASE=""          ROBOTS="index,follow,max-image-preview:large"
Set via env: BASE=/preview ROBOTS=noindex python build_landing.py
"""
import os, json, html
from PIL import Image  # noqa: F401  (kept so env matches blog tooling)

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
SITE = "https://ai-budget.pl"
APP = "https://app.ai-budget.pl"
PLAY = "https://play.google.com/store/apps/details?id=com.budget.assistant"
_b = os.environ.get("LANDING_BASE", "preview").strip("/")  # slash-free segment (avoids MSYS mangling)
BASE = ("/" + _b) if _b else ""                      # "preview" -> "/preview"; "" -> "" (apex cutover)
ROBOTS = os.environ.get("ROBOTS", "noindex,follow")  # index,follow at cutover
PUBLISH_DATE = "2026-06-19"
DEFAULT_LANG = "pl"                                  # apex default
LOCALE = {"pl": "pl_PL", "en": "en_US", "de": "de_DE", "es": "es_ES",
          "fr": "fr_FR", "ru": "ru_RU", "ua": "uk_UA", "be": "be_BY", "nl": "nl_NL"}

# lang -> content
C = {
 "pl": {
   "title": "AI Budget Assistant - budzet domowy z asystentem AI",
   "desc": "Wydatki, budzety, oszczednosci i wspolne finanse rodziny w jednej aplikacji z AI. Zacznij za darmo.",
   "nav_blog": "Blog", "nav_login": "Zaloguj sie",
   "hero_h1": "Budzet domowy z asystentem AI",
   "hero_sub": "Wydatki, budzety, oszczednosci i wspolne finanse rodziny - w jednej aplikacji. AI robi nudna robote za ciebie. Zacznij za darmo.",
   "cta_primary": "Otworz aplikacje", "cta_secondary": "Pobierz z Google Play",
   "features_title": "Wszystko w jednej aplikacji",
   "features": [
     ("Asystent AI", "Dodawaj wydatki glosem lub zdjeciem paragonu i pytaj zwyklym jezykiem, ile wydales."),
     ("Wspolny budzet", "Jedno konto - cala rodzina widzi te same wydatki i budzet na zywo."),
     ("Budzety i cele", "Elastyczne budzety z historia, cele oszczednosciowe i sledzenie dlugow."),
     ("Import z banku", "Wczytaj transakcje z Wise i bankow (CSV lub PDF) z wykrywaniem duplikatow."),
     ("Analizy", "Trendy wydatkow, podzial na kategorie i sprzedawcow oraz analizy AI."),
     ("Wszedzie", "Telefon, tablet i przegladarka, tryb offline, 9 jezykow."),
   ],
   "cta_band": "Przejmij kontrole nad pieniedzmi - sam lub z rodzina.",
   "cta_band_btn": "Zacznij za darmo",
   "footer": "AI Budget Assistant - aplikacja do budzetu domowego z AI.",
 },
 "en": {
   "title": "AI Budget Assistant - your money with an AI assistant",
   "desc": "Expenses, budgets, savings and shared family finances in one app with an AI assistant. Start free.",
   "nav_blog": "Blog", "nav_login": "Log in",
   "hero_h1": "Your money, with an AI assistant",
   "hero_sub": "Expenses, budgets, savings and shared family finances - in one app. The AI does the boring work for you. Start free.",
   "cta_primary": "Open the app", "cta_secondary": "Get it on Google Play",
   "features_title": "Everything in one app",
   "features": [
     ("AI assistant", "Add expenses by voice or a photo of a receipt, and ask in plain language how much you spent."),
     ("Shared budget", "One account - the whole family sees the same expenses and budget in real time."),
     ("Budgets and goals", "Flexible budgets with history, savings goals and debt tracking."),
     ("Bank import", "Import transactions from Wise and banks (CSV or PDF) with duplicate detection."),
     ("Analytics", "Spending trends, category and merchant breakdowns, and AI insights."),
     ("Everywhere", "Phone, tablet and web, offline-first, 9 languages."),
   ],
   "cta_band": "Take control of your money - on your own or together.",
   "cta_band_btn": "Start free",
   "footer": "AI Budget Assistant - all-in-one finance app with an AI assistant.",
 },
}

CSS = """
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1d;line-height:1.6}
a{text-decoration:none}.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
header{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border-bottom:1px solid #ececf0;z-index:10}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-weight:800;font-size:19px;color:#1a1a1d}.brand span{color:#F58320}
.nav{display:flex;align-items:center;gap:18px}.nav a{color:#5b5b66;font-weight:600;font-size:15px}
.langs{display:flex;gap:8px}.langs a{font-size:13px;color:#9a9aa3}.langs a.active{color:#1a1a1d;font-weight:700}
.btn{display:inline-block;padding:11px 20px;border-radius:10px;font-weight:700;font-size:15px}
.btn.p{background:#F58320;color:#fff}.btn.s{background:#fff;color:#1a1a1d;border:1px solid #e3e3e8}
.hero{background:radial-gradient(900px 400px at 80% -10%,rgba(245,131,42,.18),transparent),linear-gradient(180deg,#fffaf4,#fff)}
.hero .wrap{padding:78px 22px 64px;text-align:center}
.hero h1{font-size:46px;line-height:1.12;margin:0 0 18px;letter-spacing:-.5px}
.hero p{font-size:20px;color:#4b4b55;max-width:680px;margin:0 auto 30px}
.hero .btn{margin:6px}
.sec{padding:64px 0}.sec h2{text-align:center;font-size:30px;margin:0 0 40px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
@media(max-width:760px){.grid{grid-template-columns:1fr}.hero h1{font-size:34px}.hero p{font-size:17px}}
.card{padding:24px;border:1px solid #ececf0;border-radius:16px;background:#fff}
.card .ic{width:42px;height:42px;border-radius:11px;background:#fff3e6;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.card .ic b{color:#F58320;font-size:20px}
.card h3{margin:0 0 8px;font-size:18px}.card p{margin:0;color:#5b5b66;font-size:15px}
.band{background:#1a1a1d;color:#fff;text-align:center}.band .wrap{padding:56px 22px}
.band h2{font-size:28px;margin:0 0 22px}
footer{border-top:1px solid #ececf0;color:#8a8a93;font-size:14px}footer .wrap{padding:28px 22px;display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between}
footer a{color:#8a8a93}
"""

def lp(lang):  # landing path for a language
    if lang == DEFAULT_LANG:
        return f"{BASE}/" if BASE else "/"
    return f"{BASE}/{lang}/"

def head(lang, langs):
    t = C[lang]
    url = SITE + lp(lang)
    alts = "".join(f'<link rel="alternate" hreflang="{l}" href="{SITE+lp(l)}">' for l in langs)
    alts += f'<link rel="alternate" hreflang="x-default" href="{SITE+lp("en") if "en" in langs else url}">'
    ld = {"@context": "https://schema.org", "@type": "SoftwareApplication",
          "name": "AI Budget Assistant", "applicationCategory": "FinanceApplication",
          "operatingSystem": "Android, Web", "inLanguage": lang,
          "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
          "url": url}
    return f"""<!DOCTYPE html><html lang="{lang}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(t['title'])}</title>
<meta name="description" content="{html.escape(t['desc'])}">
<link rel="canonical" href="{url}">
<meta name="robots" content="{ROBOTS}">
<meta property="og:type" content="website"><meta property="og:site_name" content="AI Budget Assistant">
<meta property="og:locale" content="{LOCALE[lang]}">
<meta property="og:title" content="{html.escape(t['title'])}">
<meta property="og:description" content="{html.escape(t['desc'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/blog/{lang if lang in ('en','pl') else 'en'}/assets/og-default.png">
<meta name="twitter:card" content="summary_large_image">
{alts}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>{CSS}</style></head><body>"""

def page(lang, langs):
    t = C[lang]
    blog = f"/blog/{lang if lang in ('en','pl') else 'en'}/"
    langsw = "".join(
        f'<a class="{"active" if l==lang else ""}" href="{lp(l)}">{l.upper()}</a>' for l in langs)
    cards = "".join(
        f'<div class="card"><div class="ic"><b>{i+1}</b></div><h3>{html.escape(h)}</h3><p>{html.escape(p)}</p></div>'
        for i, (h, p) in enumerate(t["features"]))
    return (head(lang, langs)
        + f'<header><div class="wrap"><a class="brand" href="{lp(lang)}">AI <span>Budget</span> Assistant</a>'
          f'<nav class="nav"><div class="langs">{langsw}</div><a href="{blog}">{t["nav_blog"]}</a>'
          f'<a class="btn p" href="{APP}">{t["nav_login"]}</a></nav></div></header>'
        + f'<section class="hero"><div class="wrap"><h1>{html.escape(t["hero_h1"])}</h1>'
          f'<p>{html.escape(t["hero_sub"])}</p>'
          f'<a class="btn p" href="{APP}">{t["cta_primary"]}</a>'
          f'<a class="btn s" href="{PLAY}">{t["cta_secondary"]}</a></div></section>'
        + f'<section class="sec"><div class="wrap"><h2>{html.escape(t["features_title"])}</h2>'
          f'<div class="grid">{cards}</div></div></section>'
        + f'<section class="band"><div class="wrap"><h2>{html.escape(t["cta_band"])}</h2>'
          f'<a class="btn p" href="{APP}">{t["cta_band_btn"]}</a></div></section>'
        + f'<footer><div class="wrap"><span>{html.escape(t["footer"])}</span>'
          f'<span><a href="{blog}">{t["nav_blog"]}</a> &nbsp; <a href="{PLAY}">Google Play</a></span></div></footer>'
        + '</body></html>')

def build():
    langs = list(C.keys())
    for lang in langs:
        d = OUT if lang == DEFAULT_LANG else os.path.join(OUT, lang)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(page(lang, langs))
    print(f"built landing for {len(langs)} langs ({','.join(langs)}) BASE='{BASE}' ROBOTS='{ROBOTS}' -> {OUT}")

if __name__ == "__main__":
    build()
