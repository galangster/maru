#!/usr/bin/env bash
# One-shot Stripe wiring for the Maru sync service.
# Asks for the live secret key without echoing it, creates the product, the
# two prices and the webhook endpoint (idempotent), and writes the four
# variables into the Railway `sync` service. Prints no secret.
set -euo pipefail
cd "$(dirname "$0")/.."

printf 'Paste the Stripe LIVE secret key (nothing will appear), then press Return: '
IFS= read -rs KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
case "$KEY" in
  sk_live_*|sk_test_*) ;;
  *) echo "That does not look like a Stripe secret key (sk_live_… or sk_test_…)."; exit 1 ;;
esac

echo "Creating the product, prices and webhook in Stripe…"
OUT="$(STRIPE_SECRET_KEY="$KEY" node --import tsx scripts/stripe-setup.ts)"
MONTHLY="$(printf '%s\n' "$OUT" | sed -n 's/^STRIPE_PRICE_MONTHLY=//p')"
YEARLY="$(printf '%s\n' "$OUT" | sed -n 's/^STRIPE_PRICE_YEARLY=//p')"
WEBHOOK="$(printf '%s\n' "$OUT" | sed -n 's/^STRIPE_WEBHOOK_SECRET=//p')"
[ -n "$MONTHLY" ] && [ -n "$YEARLY" ] || { echo "Stripe did not return both price ids:"; printf '%s\n' "$OUT" | grep -v SECRET; exit 1; }
echo "  monthly price: $MONTHLY"
echo "  yearly price:  $YEARLY"
if [ -n "$WEBHOOK" ]; then echo "  webhook endpoint: created (secret captured)"; else echo "  webhook endpoint: already existed (its secret is only shown at creation; set STRIPE_WEBHOOK_SECRET by hand if Railway lacks it)"; fi

echo "Writing the variables to the Railway sync service…"
ARGS=(--set "STRIPE_SECRET_KEY=$KEY" --set "STRIPE_PRICE_MONTHLY=$MONTHLY" --set "STRIPE_PRICE_YEARLY=$YEARLY")
[ -n "$WEBHOOK" ] && ARGS+=(--set "STRIPE_WEBHOOK_SECRET=$WEBHOOK")
railway variables --service sync "${ARGS[@]}" >/dev/null
echo "Done. Railway is redeploying the sync service with billing enabled."
echo "Last step in the Stripe dashboard: Settings → Tax → turn on Stripe Tax."
