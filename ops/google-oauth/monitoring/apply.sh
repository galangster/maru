#!/usr/bin/env bash
# Apply Maru production monitoring to the Google Cloud project.
# The script is idempotent. It skips each resource that already exists.
# Requires: gcloud, authenticated as a project owner.
set -euo pipefail

PROJECT="maru-mail-prod"
CHANNEL_EMAIL="support@getmaru.app"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== Notification channel =="
CHANNEL=$(gcloud beta monitoring channels list --project="$PROJECT" \
  --filter="type=email AND labels.email_address=$CHANNEL_EMAIL" \
  --format="value(name)" | head -1)
if [ -z "$CHANNEL" ]; then
  CHANNEL=$(gcloud beta monitoring channels create --project="$PROJECT" \
    --display-name="Maru ops email" --type=email \
    --channel-labels="email_address=$CHANNEL_EMAIL" --format="value(name)")
  echo "created $CHANNEL"
else
  echo "exists $CHANNEL"
fi

make_policy() {
  local name="$1" threshold="$2" period="$3"
  local existing
  existing=$(gcloud alpha monitoring policies list --project="$PROJECT" \
    --filter="displayName=\"$name\"" --format="value(name)" | head -1)
  if [ -n "$existing" ]; then
    echo "exists $name"
    return
  fi
  local tmp
  tmp=$(mktemp)
  sed -e "s/__NAME__/$name/g" -e "s/__THRESHOLD__/$threshold/g" \
    -e "s/__PERIOD__/$period/g" "$DIR/policy-quota.tmpl.json" > "$tmp"
  gcloud alpha monitoring policies create --project="$PROJECT" \
    --policy-from-file="$tmp" --notification-channels="$CHANNEL" \
    --format="value(name)"
  rm -f "$tmp"
  echo "created $name"
}

echo "== Quota threshold policies =="
make_policy "Maru Gmail minute quota 50% (600k units-min)"  600000   "60s"
make_policy "Maru Gmail minute quota 70% (840k units-min)"  840000   "60s"
make_policy "Maru Gmail minute quota 90% (1.08M units-min)" 1080000  "60s"
make_policy "Maru Gmail daily units 50% (40M units-day)"    40000000 "86400s"
make_policy "Maru Gmail daily units 70% (56M units-day)"    56000000 "86400s"
make_policy "Maru Gmail daily units 90% (72M units-day)"    72000000 "86400s"

echo "== Gmail 4xx policy =="
EXISTING=$(gcloud alpha monitoring policies list --project="$PROJECT" \
  --filter='displayName="Maru Gmail API 4xx spike"' --format="value(name)" | head -1)
if [ -n "$EXISTING" ]; then
  echo "exists Maru Gmail API 4xx spike"
else
  gcloud alpha monitoring policies create --project="$PROJECT" \
    --policy-from-file="$DIR/policy-gmail-4xx.json" \
    --notification-channels="$CHANNEL" --format="value(name)"
  echo "created Maru Gmail API 4xx spike"
fi

echo "== Dashboard =="
EXISTING=$(gcloud monitoring dashboards list --project="$PROJECT" \
  --filter='displayName="Maru Gmail API quota"' --format="value(name)" | head -1)
if [ -n "$EXISTING" ]; then
  echo "exists Maru Gmail API quota"
else
  gcloud monitoring dashboards create --project="$PROJECT" \
    --config-from-file="$DIR/dashboard.json" --format="value(name)"
  echo "created Maru Gmail API quota"
fi

echo "== Done =="
