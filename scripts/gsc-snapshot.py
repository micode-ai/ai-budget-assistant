#!/usr/bin/env python3
"""Weekly Search Console snapshot for ai-budget.pl (ABA-688).

Pulls Search Analytics through the Search Console API with a read-only service
account, aggregates it into weeks per site section (landing, help, blog per
language), and writes a Markdown report plus a raw JSON snapshot. Runs weekly
from `gsc-snapshot.yml`; also runs locally, which replaces reading the GSC UI
through the browser for a re-measure.

Why weeks per section: the September 2026 decline (ABA-686) was a one-day step
on 2026-09-15 that 28-day totals hid for a month. A weekly series per section,
with an alert on a sharp drop, shows a step within a week.

Auth (first match wins):
  --key-file PATH                  service-account JSON key file
  GSC_SERVICE_ACCOUNT_JSON (env)   the key file's contents (CI secret)
The service account must be added in Search Console as a user (Restricted is
enough) of the property `sc-domain:ai-budget.pl`.

  python scripts/gsc-snapshot.py --key-file key.json --out report.md --json snap.json
  python scripts/gsc-snapshot.py --from-json snap.json --out report.md   # re-render offline

No model call and no write anywhere: the report is for a person to read.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
from collections import defaultdict

SITE = "sc-domain:ai-budget.pl"
ORIGIN = "https://ai-budget.pl"
SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
API = "https://searchconsole.googleapis.com/webmasters/v3/sites/{}/searchAnalytics/query"
LANGS = ["pl", "en", "de", "es", "fr", "ru", "ua", "be", "nl"]

# Data in Search Console lags about two days, and the last days are revised.
# A week is reported only once its Sunday is at least LAG_DAYS old.
LAG_DAYS = 3
WEEKS = 12
SHOWN_WEEKS = 8

# A section alerts when last week's impressions fall below DROP_RATIO of its
# previous four-week mean, and only when that mean is at least MIN_BASE — below
# that, one query appearing or vanishing swings the ratio and the alert is noise.
DROP_RATIO = 0.7
MIN_BASE = 50
LOSER_MIN_BASE = 5
LOSERS = 10


# ---------- fetching ----------

def session_from_key(key_file):
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import AuthorizedSession
    except ImportError:
        sys.exit("needs google-auth and requests: pip install google-auth requests")
    if key_file:
        creds = service_account.Credentials.from_service_account_file(key_file, scopes=[SCOPE])
    else:
        raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON", "").strip()
        if not raw:
            sys.exit("no credentials: pass --key-file or set GSC_SERVICE_ACCOUNT_JSON")
        creds = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=[SCOPE])
    return AuthorizedSession(creds)


def query(session, start, end, dimensions):
    """All rows for the range; the API caps a page at 25,000 rows."""
    url = API.format(urllib.parse.quote(SITE, safe=""))
    rows, start_row = [], 0
    while True:
        body = {"startDate": start.isoformat(), "endDate": end.isoformat(),
                "dimensions": dimensions, "type": "web",
                "rowLimit": 25000, "startRow": start_row}
        r = session.post(url, json=body, timeout=60)
        if r.status_code != 200:
            sys.exit(f"Search Console API {r.status_code}: {r.text[:500]}")
        page = r.json().get("rows", [])
        rows += [{"keys": x["keys"], "clicks": x["clicks"], "impressions": x["impressions"],
                  "position": x["position"]} for x in page]
        if len(page) < 25000:
            return rows
        start_row += 25000


def week_range(today, weeks):
    """Monday of the first week and Sunday of the last complete, settled week."""
    last_sunday = today - dt.timedelta(days=LAG_DAYS)
    last_sunday -= dt.timedelta(days=(last_sunday.weekday() + 1) % 7)
    first_monday = last_sunday - dt.timedelta(days=7 * weeks - 1)
    return first_monday, last_sunday


def fetch(session, today):
    start, end = week_range(today, WEEKS)
    return {"site": SITE, "start": start.isoformat(), "end": end.isoformat(),
            "fetched": today.isoformat(),
            # Property totals come from a date-only query: Search Console counts a
            # search once per property but once per page in a page breakdown.
            "by_date": query(session, start, end, ["date"]),
            "by_date_page": query(session, start, end, ["date", "page"])}


# ---------- aggregation (pure) ----------

def section_of(url):
    path = url[len(ORIGIN):] if url.startswith(ORIGIN) else url
    parts = [p for p in path.split("/") if p]
    if parts[:1] == ["blog"]:
        return f"blog/{parts[1]}" if len(parts) > 1 and parts[1] in LANGS else "blog/other"
    if parts[:1] == ["help"]:
        return "help"
    return "landing"


def week_of(day, start):
    return (dt.date.fromisoformat(day) - start).days // 7


def empty_weeks(n):
    return [{"clicks": 0, "impressions": 0, "pw": 0.0} for _ in range(n)]


def add(cell, row):
    cell["clicks"] += row["clicks"]
    cell["impressions"] += row["impressions"]
    cell["pw"] += row["position"] * row["impressions"]


def aggregate(snap):
    start = dt.date.fromisoformat(snap["start"])
    n = (dt.date.fromisoformat(snap["end"]) - start).days // 7 + 1
    sections = defaultdict(lambda: empty_weeks(n))
    pages = defaultdict(lambda: [0] * n)
    for row in snap["by_date"]:
        add(sections["site"][week_of(row["keys"][0], start)], row)
    for row in snap["by_date_page"]:
        day, url = row["keys"]
        w = week_of(day, start)
        sec = section_of(url)
        add(sections[sec][w], row)
        if sec.startswith("blog/"):
            add(sections["blog"][w], row)
        pages[url][w] += row["impressions"]
    labels = [(start + dt.timedelta(days=7 * i)).strftime("%m-%d") for i in range(n)]
    return labels, dict(sections), dict(pages)


def position(cell):
    return cell["pw"] / cell["impressions"] if cell["impressions"] else None


def prior_mean(series, key="impressions"):
    prev = [c[key] for c in series[-5:-1]]
    return sum(prev) / len(prev) if prev else 0


def alerts(sections):
    out = []
    for name, series in sections.items():
        base = prior_mean(series)
        last = series[-1]["impressions"]
        if base >= MIN_BASE and last < DROP_RATIO * base:
            out.append(f"{name}: {last} impressions last week vs {base:.0f}/week before "
                       f"({(last / base - 1) * 100:+.0f}%)")
    return out


def losers(pages):
    rows = []
    for url, series in pages.items():
        prev = series[-5:-1]
        base = sum(prev) / len(prev) if prev else 0
        if base >= LOSER_MIN_BASE and series[-1] < base:
            rows.append((series[-1] - base, url, base, series[-1]))
    return sorted(rows)[:LOSERS]


# ---------- rendering (pure) ----------

ORDER = ["site", "landing", "help", "blog"] + [f"blog/{l}" for l in LANGS] + ["blog/other"]


def fmt_pos(p):
    return f"{p:.1f}" if p is not None else "–"


def render(snap):
    labels, sections, pages = aggregate(snap)
    names = [s for s in ORDER if s in sections]
    shown = labels[-SHOWN_WEEKS:]
    out = [f"_Generated by `gsc-snapshot.yml` from the Search Console API — `{SITE}`, "
           f"weeks Monday–Sunday, {snap['start']} → {snap['end']} (fetched {snap['fetched']})._", ""]

    found = alerts({s: sections[s] for s in names})
    out += ["## Alerts", ""]
    out += [f"- ⚠️ {a}" for a in found] or [
        f"None — no section with at least {MIN_BASE} impressions/week fell below "
        f"{int(DROP_RATIO * 100)}% of its previous four-week mean."]
    out.append("")

    out += ["## Impressions per week", "",
            "| Section | " + " | ".join(shown) + " |",
            "|---|" + "---:|" * len(shown)]
    for s in names:
        out.append(f"| {s} | " + " | ".join(str(c["impressions"]) for c in sections[s][-SHOWN_WEEKS:]) + " |")
    out.append("")

    out += ["## Last week", "",
            "| Section | Clicks | Impressions | CTR | Position | Prior 4-wk impressions | Change |",
            "|---|---:|---:|---:|---:|---:|---:|"]
    for s in names:
        c = sections[s][-1]
        base = prior_mean(sections[s])
        ctr = f"{c['clicks'] / c['impressions'] * 100:.1f}%" if c["impressions"] else "–"
        change = f"{(c['impressions'] / base - 1) * 100:+.0f}%" if base else "–"
        out.append(f"| {s} | {c['clicks']} | {c['impressions']} | {ctr} | "
                   f"{fmt_pos(position(c))} | {base:.0f} | {change} |")
    out.append("")

    out += ["## Average position per week", "",
            "| Section | " + " | ".join(shown) + " |",
            "|---|" + "---:|" * len(shown)]
    for s in names:
        out.append(f"| {s} | " + " | ".join(fmt_pos(position(c)) for c in sections[s][-SHOWN_WEEKS:]) + " |")
    out.append("")

    lost = losers(pages)
    out += ["## Pages that lost the most impressions", "",
            "Last week against the page's own previous four-week mean.", ""]
    if lost:
        out += ["| Page | Prior 4-wk mean | Last week |", "|---|---:|---:|"]
        out += [f"| {url[len(ORIGIN):] or '/'} | {base:.0f} | {last} |" for _, url, base, last in lost]
    else:
        out.append("None.")
    out.append("")
    return "\n".join(out), found


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key-file")
    ap.add_argument("--from-json", help="re-render a saved snapshot instead of calling the API")
    ap.add_argument("--json", help="write the raw snapshot here")
    ap.add_argument("--out", help="write the Markdown report here (default: stdout)")
    ap.add_argument("--alerts", help="write one alert per line here (empty file when none)")
    args = ap.parse_args()

    if args.from_json:
        with open(args.from_json, encoding="utf-8") as f:
            snap = json.load(f)
    else:
        snap = fetch(session_from_key(args.key_file), dt.date.today())
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(snap, f)

    report, found = render(snap)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(report)
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(report)
    if args.alerts:
        with open(args.alerts, "w", encoding="utf-8") as f:
            f.write("".join(a + "\n" for a in found))


if __name__ == "__main__":
    main()
