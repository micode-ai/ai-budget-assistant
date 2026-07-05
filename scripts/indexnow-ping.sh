#!/usr/bin/env bash
#
# Ping IndexNow (Bing, Yandex, Seznam, ...) with the static site pages that
# changed in a git range, so new/updated blog + landing + help pages get
# discovered quickly instead of waiting for the next organic crawl.
#
# Maps committed generated pages to their live URLs:
#   docs/marketing/seo/site/blog/<l>/<slug>/index.html -> https://ai-budget.pl/blog/<l>/<slug>/
#   docs/marketing/landing/site/<path>/index.html      -> https://ai-budget.pl/<path>/
#   docs/marketing/help/site/help/<l>/<slug>/index.html-> https://ai-budget.pl/help/<l>/<slug>/
#
# Non-fatal by design: any IndexNow problem warns but NEVER fails the deploy.
# Usage: INDEXNOW_KEY=<key> scripts/indexnow-ping.sh <git-range>
#        DRY_RUN=1 prints the payload instead of POSTing.
set -uo pipefail

HOST="ai-budget.pl"
RANGE="${1:-HEAD~1..HEAD}"
KEY="${INDEXNOW_KEY:-}"
[ -n "$KEY" ] || { echo "::warning::INDEXNOW_KEY unset — skipping IndexNow ping"; exit 0; }

changed=$(git diff --name-only "$RANGE" -- docs/marketing 2>/dev/null | grep -E "/site/.*index\.html$" || true)
[ -n "$changed" ] || { echo "IndexNow: no changed site pages in $RANGE — skipping."; exit 0; }

urls=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  u="$f"
  u="${u#docs/marketing/seo/site/}"
  u="${u#docs/marketing/landing/site/}"
  u="${u#docs/marketing/help/site/}"
  u="${u%index.html}"
  [ "$u" = "blog/" ] && continue      # /blog/ is a noindex JS dispatcher
  urls+="https://${HOST}/${u}"$'\n'
done <<< "$changed"

urls=$(printf '%s' "$urls" | grep -v '^$' | sort -u || true)
[ -n "$urls" ] || { echo "IndexNow: nothing to submit."; exit 0; }
count=$(printf '%s\n' "$urls" | wc -l | tr -d ' ')
echo "IndexNow: $count changed page(s):"
printf '%s\n' "$urls"

list=$(printf '%s\n' "$urls" | sed 's/.*/"&"/' | paste -sd, -)
body="{\"host\":\"${HOST}\",\"key\":\"${KEY}\",\"keyLocation\":\"https://${HOST}/${KEY}.txt\",\"urlList\":[${list}]}"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN payload:"; echo "$body"; exit 0
fi

code=$(curl -sS -o /tmp/indexnow.out -w "%{http_code}" -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" --data-binary "$body" || echo "000")
echo "IndexNow response: HTTP $code"
[ -s /tmp/indexnow.out ] && cat /tmp/indexnow.out
case "$code" in
  200|202) echo "IndexNow: accepted." ;;
  *) echo "::warning::IndexNow returned $code (non-fatal)" ;;
esac
exit 0
