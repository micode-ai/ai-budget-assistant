# Directory badges in the footer

*Parent: [marketing-site](marketing-site.md)*

## What this is

The row of "featured on" badges in the footer of every landing, blog and help page. Each badge is a
trade: a directory shows a verified listing only once it finds a link back from our site.

## Entry points

- `docs/marketing/landing/build_landing.py` — `footer_html()`, one constant per badge
- `docs/marketing/seo/build_blog.py` — `foot()`, the same constants for the blog and help chrome

One edit per file covers all three sites.

## Key concepts

**The `href` is used exactly as the vendor specifies; everything presentational follows this row's
conventions** — a scoped size class, real `width`/`height`, `loading="lazy"`, `rel="noopener"`, no
`title` duplicating `alt`, no inline `style`, and a descriptive product-naming `alt`. That split is
what stops a row of vendor snippets turning one footer into as many styles as it has badges.

**Uniform height across both rows**, with each badge's width recomputed from its own native aspect
ratio at that height — never by scaling the previously rounded number.

**Two rows since the ninth badge.** Both footers' `.wrap` is already `flex-direction: column;
gap: 16px`, so two sibling `.f-badge` divs space themselves with no new CSS.

## Invariants

**Compute the row width; do not estimate it.** Content width is `.wrap`'s 1040px max minus 22px of
side padding = **996px**, and a row costs `Σ(widths) + 16 × (badges − 1)`. A first estimate of 35px
per badge missed by 3px and would have wrapped the row, defeating the change.

**Verify against a generated page, not the source constants**, so the check sees what ships. Use a
parser that tolerates the one badge rendered as a nested `<div>` card: a non-greedy
`<div class="f-badge">(.*?)</div>` terminates inside it and silently under-reports that row by one.

**Confirm a listing URL is real before wiring it.** Every path on some of these hosts is a soft-404
serving the generic homepage, so a guessed URL looks alive. Check that the page's `<title>` names
the product and that its byte size differs from the host's generic page. One badge shipped pointing
at a 404 because the URL came from a pre-claim snippet — a badge linking to a 404 is worse than no
badge.

**When a directory claims our site returned an error, read back the URL it holds for us.** One
verifier reported "HTTP 403"; the apex container had served exactly two 403s in its history, both
on a directory-index request, and other directories' bots got 200 in the same window. The listing
stored our URL with a single slash and then prepended `https://` to a value that already had a
scheme — the request reached nobody. `docker logs ai-budget-web-prod | grep '" 403 '` is the
one-line check, and the listing's own Website field is the input we cannot see from our logs.

**Self-host only when the vendor refuses hotlinking.** One host does not serve its image
cross-origin and **hangs rather than erroring**, so the badge was blank in production for two
deploys while the others loaded. Only the verification link matters, so rehosting that artwork is
safe — but a badge whose image changes with launch status or is API-generated must stay remote, or
it freezes.

**A self-hosted asset needs `git add -f` in both the source and `site/` trees**, and a `test -f`
guard in `web-deploy.yml`, because `docs/marketing` is gitignored.

**Ignore a vendor snippet's dimensions when they contradict the artwork.** Several ship a
`width`/`height` pair that squashes or upscales their own `viewBox`; one ships a bare width with no
height at all. Use the native ratio.

## Known gaps

- One badge reads "Launching Soon" and its listing is now live, so the premise has expired; it is
  the first candidate to remove when the row next needs room. Removing our link back may un-verify
  the listing.
- One badge shipped before its listing URL could be confirmed and still needs checking.
- Adding a tenth badge reopens the same four options — drop one, escape the width cap, shrink
  again, or a third row. Add it to the **shorter** row and re-measure.

## History

ABA-367 (the first badge) and the additions since, each of which re-ran the width arithmetic —
ABA-493, 524, 525, 526, 527, 528, 539, 543, 544.
