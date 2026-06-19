# -*- coding: utf-8 -*-
"""
Build static, crawlable HTML blog pages from the SEO markdown articles.

Why this exists: ai-budget.pl is an Expo "single" SPA (JS-rendered, one <title>,
no per-page meta), so it cannot rank for article keywords. This generates real
HTML files with full <head> (title, meta, canonical, OG, JSON-LD, hreflang) that
nginx serves directly (its `try_files $uri $uri/ /index.html` serves real files
before the SPA fallback). web-deploy.yml copies site/ into dist/ before rsync.

Run:  python build_blog.py
Out:  docs/marketing/seo/site/  -> blog/index.html, blog/<slug>/index.html,
      sitemap.xml, robots.txt, blog/assets/og-default.png
"""
import os, re, json, html, glob, shutil
import markdown as md_lib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "site")
SITE = "https://ai-budget.pl"
PLAY = "https://play.google.com/store/apps/details?id=com.budget.assistant"
LANG = "pl"
PUBLISH_DATE = "2026-06-19"  # keep builds deterministic; bump on real edits
OG_PATH = "/blog/assets/og-default.png"

# ---------- markdown + frontmatter ----------
def parse(path):
    raw = open(path, encoding="utf-8").read()
    meta = {}
    body = raw
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

# ---------- page template ----------
CSS = """
:root{--o:#F58320;--ink:#1a1a1d;--mut:#5b5b66;--line:#ececf0;--bg:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.7}
.wrap{max-width:720px;margin:0 auto;padding:0 20px}
header.site{border-bottom:1px solid var(--line)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{font-weight:800;color:var(--ink);text-decoration:none;font-size:18px}
.brand span{color:var(--o)}
header .cta-top{font-size:14px;font-weight:600;color:#fff;background:var(--o);padding:8px 14px;border-radius:8px;text-decoration:none}
nav.crumb{font-size:13px;color:var(--mut);padding:16px 0}
nav.crumb a{color:var(--mut)}
article h1{font-size:32px;line-height:1.25;margin:8px 0 16px}
article h2{font-size:23px;margin:34px 0 10px}
article h3{font-size:18px;margin:24px 0 8px}
article p,article li{font-size:17px;color:#27272e}
article a{color:#c96a12}
article ul{padding-left:22px}
hr{border:0;border-top:1px solid var(--line);margin:32px 0}
.cta{margin:36px 0;padding:22px;border:1px solid var(--line);border-radius:14px;background:#fffaf4}
.cta h3{margin:0 0 6px}
.cta p{margin:0 0 14px;color:var(--mut);font-size:15px}
.btn{display:inline-block;margin:4px 8px 4px 0;padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px}
.btn.p{background:var(--o);color:#fff}
.btn.s{background:#fff;color:var(--ink);border:1px solid var(--line)}
.related{margin:36px 0}
.related h2{font-size:20px}
.related a{display:block;padding:12px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink);font-weight:600}
footer.site{border-top:1px solid var(--line);margin-top:40px;padding:24px 0;color:var(--mut);font-size:14px}
footer.site a{color:var(--mut)}
.card{display:block;padding:18px 0;border-bottom:1px solid var(--line);text-decoration:none}
.card h2{margin:0 0 6px;font-size:21px;color:var(--ink)}
.card p{margin:0;color:var(--mut);font-size:15px}
"""

def head(title, desc, url, jsonld, og_type="article"):
    return f"""<!DOCTYPE html>
<html lang="{LANG}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="AI Budget Assistant">
<meta property="og:locale" content="pl_PL">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}{OG_PATH}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{SITE}{OG_PATH}">
<link rel="alternate" hreflang="pl" href="{url}">
<link rel="alternate" hreflang="x-default" href="{url}">
<script type="application/ld+json">{json.dumps(jsonld, ensure_ascii=False)}</script>
<style>{CSS}</style>
</head>
<body>
<header class="site"><div class="wrap"><a class="brand" href="/">AI <span>Budget</span> Assistant</a><a class="cta-top" href="{SITE}/">Otwórz aplikację</a></div></header>
"""

FOOT = f"""<footer class="site"><div class="wrap">AI Budget Assistant - aplikacja do budzetu domowego z AI. <a href="{SITE}/">Wersja webowa</a> - <a href="{PLAY}">Google Play</a></div></footer>
</body></html>"""

def cta_block():
    return f"""<aside class="cta">
<h3>Prowadz budzet domowy z AI</h3>
<p>Dodawaj wydatki glosem lub zdjeciem paragonu, sledz budzety i oszczednosci, wspolnie z rodzina. Zacznij za darmo.</p>
<a class="btn p" href="{SITE}/">Otworz w przegladarce</a>
<a class="btn s" href="{PLAY}">Pobierz z Google Play</a>
</aside>"""

def article_jsonld(title, desc, url):
    return {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Article", "headline": title, "description": desc,
             "inLanguage": LANG, "datePublished": PUBLISH_DATE, "dateModified": PUBLISH_DATE,
             "mainEntityOfPage": {"@type": "WebPage", "@id": url},
             "author": {"@type": "Organization", "name": "AI Budget Assistant"},
             "publisher": {"@type": "Organization", "name": "AI Budget Assistant",
                           "logo": {"@type": "ImageObject", "url": f"{SITE}{OG_PATH}"}},
             "image": f"{SITE}{OG_PATH}"},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Strona glowna", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}/blog/"},
                {"@type": "ListItem", "position": 3, "name": title, "item": url}]},
        ],
    }

# ---------- og image ----------
def build_og(path):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (24, 16, 9))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(40 - 16 * t), int(26 - 12 * t), int(14 - 6 * t)))
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
    d.rounded_rectangle([80, 70, 80 + 90, 70 + 10], radius=5, fill=(245, 131, 42))
    d.text((80, 110), "AI Budget Assistant", font=brand, fill=(245, 131, 42))
    d.text((80, 250), "Budzet domowy", font=bold, fill=(250, 250, 252))
    d.text((80, 330), "z asystentem AI", font=bold, fill=(250, 250, 252))
    d.text((80, 470), "Wydatki, budzety, oszczednosci - razem z rodzina", font=reg, fill=(205, 205, 212))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")

# ---------- build ----------
def build():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "blog"))
    build_og(os.path.join(OUT, "blog", "assets", "og-default.png"))

    arts = []
    for f in sorted(glob.glob(os.path.join(ROOT, "0*.md"))):
        meta, body = parse(f)
        if not meta.get("slug"):
            print("  skip (no slug):", f); continue
        arts.append({"meta": meta, "body": body})

    # article pages
    for i, a in enumerate(arts):
        m = a["meta"]
        slug = m["slug"]
        url = f"{SITE}/blog/{slug}/"
        title = m.get("title", slug)
        desc = m.get("meta_description", "")
        related = [x for j, x in enumerate(arts) if j != i]
        rel_html = "".join(
            f'<a href="/blog/{r["meta"]["slug"]}/">{html.escape(r["meta"].get("title", ""))}</a>'
            for r in related)
        page = (head(title, desc, url, article_jsonld(title, desc, url))
                + '<main class="wrap"><nav class="crumb"><a href="/">Strona glowna</a> / <a href="/blog/">Blog</a></nav>'
                + f'<article>{to_html(a["body"])}</article>'
                + cta_block()
                + f'<section class="related"><h2>Powiazane artykuly</h2>{rel_html}</section>'
                + '</main>' + FOOT)
        d = os.path.join(OUT, "blog", slug)
        os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n").write(page)

    # blog index
    cards = "".join(
        f'<a class="card" href="/blog/{a["meta"]["slug"]}/"><h2>{html.escape(a["meta"].get("title",""))}</h2>'
        f'<p>{html.escape(a["meta"].get("meta_description",""))}</p></a>'
        for a in arts)
    idx_url = f"{SITE}/blog/"
    idx_ld = {"@context": "https://schema.org", "@type": "CollectionPage",
              "name": "Blog - AI Budget Assistant", "inLanguage": LANG, "url": idx_url}
    idx = (head("Blog o budzecie domowym i oszczedzaniu | AI Budget Assistant",
                "Praktyczne poradniki: jak prowadzic budzet domowy, kontrolowac wydatki i oszczedzac pieniadze.",
                idx_url, idx_ld, og_type="website")
           + '<main class="wrap"><nav class="crumb"><a href="/">Strona glowna</a> / Blog</nav>'
           + '<h1>Blog</h1><p>Poradniki o finansach osobistych, budzecie domowym i oszczedzaniu.</p>'
           + cards + cta_block() + '</main>' + FOOT)
    open(os.path.join(OUT, "blog", "index.html"), "w", encoding="utf-8", newline="\n").write(idx)

    # sitemap + robots
    urls = [(f"{SITE}/", "weekly", "1.0"), (idx_url, "weekly", "0.8")]
    urls += [(f"{SITE}/blog/{a['meta']['slug']}/", "monthly", "0.7") for a in arts]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u, cf, pr in urls:
        sm.append(f"<url><loc>{u}</loc><lastmod>{PUBLISH_DATE}</lastmod>"
                  f"<changefreq>{cf}</changefreq><priority>{pr}</priority></url>")
    sm.append("</urlset>")
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8", newline="\n").write("\n".join(sm))
    open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8", newline="\n").write(
        f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")

    print(f"built {len(arts)} articles + index + sitemap + robots -> {OUT}")

if __name__ == "__main__":
    build()
