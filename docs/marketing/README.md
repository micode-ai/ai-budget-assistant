# Marketing

All marketing material for AI Budget Assistant: copy, creatives, generators, and
the two generated static websites.

## Structure

```
docs/marketing/
├── copy/                 Text to publish (posts, listings, ASO)
│   ├── feature-posts.md          Facebook/social posts per feature (RU/EN/PL)
│   ├── launch-posts.md           Product Hunt + Reddit launch copy
│   ├── welcome-post.md           Intro / announcement post
│   ├── instagram-stories.md      Story storyboards (RU/EN/PL)
│   ├── google-play-listings.md   Play Store listing (all languages)
│   ├── google-play-listing-en.md Play Store listing (EN)
│   ├── aso-keywords.md           App Store Optimization keywords
│   └── conversion-audit.md       Funnel / conversion notes
│
├── creatives/            Rendered media + source screenshots, by campaign
│   ├── web-site/                 NEW landing site + web-app-moved campaign
│   │   ├── web-site*.png             source browser screenshots (input)
│   │   └── renders/<lang>/           generated posters + reels (output)
│   │       ├── 01-hero.png … 04-app.png      static 9:16 posters
│   │       ├── web-site-reel.{mp4,gif}       reel 9:16 (Reels/Stories)
│   │       └── web-site-reel-4x5.{mp4,gif}   reel 4:5 (Instagram/FB feed)
│   ├── web-app/                  Older "open the budget in your browser" campaign
│   │   ├── web*.png, web-story.{gif,jpg,mp4}
│   ├── bank-import/              Bank-import story (gif/jpg/mp4)
│   └── stories/                  One-off story graphics (bots, shared accounts)
│
├── assets/               Shared input assets for the generators
│   └── micode-badge.png          MICODE badge used in the top-right of creatives
│
├── scripts/              Python generators (run with the system Python; needs Pillow, imageio, numpy)
│   ├── build_web_site_reel.py    web-site reel (mp4 + gif), PL, 9:16 or 4:5
│   ├── build_web_site_story.py   web-site static 9:16 posters (pl/ru/en)
│   └── build_store_assets.py     Play Store screenshots from feature_graphics/
│
├── feature_graphics/     Raw Play Store screenshots + per-language renders
│                         (input for build_store_assets.py AND the landing site)
│
├── landing/              Static marketing landing site  ⚠️ shipped by CI — do not move
│   ├── build_landing.py          generator
│   └── site/                     generated HTML (copied to the apex by web-deploy.yml)
│
├── seo/                  Static SEO blog  ⚠️ shipped by CI — do not move
│   ├── build_blog.py             generator
│   └── site/                     generated HTML (copied to /blog by web-deploy.yml)
│
└── help/                 Static public help center (from user_docs/)  ⚠️ shipped by CI — do not move
    ├── build_help.py             generator (reuses seo/build_blog.py chrome via import)
    └── site/                     generated HTML (copied to /help by web-deploy.yml)
```

> `landing/site`, `seo/site` and `help/site` are consumed by `.github/workflows/web-deploy.yml`
> (and documented in `docs/ops/web-deploy.md`). Keep those paths stable.

## Regenerate

```bash
# web-site campaign reel (Polish). aspect: 9:16 (Reels/Stories) or 4:5 (feed)
python docs/marketing/scripts/build_web_site_reel.py both 9:16
python docs/marketing/scripts/build_web_site_reel.py both 4:5

# web-site static posters (pl ru en)
python docs/marketing/scripts/build_web_site_story.py pl ru en

# Play Store screenshots
python docs/marketing/scripts/build_store_assets.py all en

# Landing site / SEO blog / help center
# Order matters: blog + help BEFORE landing — the apex sitemap reads their sitemaps.
python docs/marketing/seo/build_blog.py
python docs/marketing/help/build_help.py
LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py
```
