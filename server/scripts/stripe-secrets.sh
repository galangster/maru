#!/usr/bin/env bash
# Sets the two Stripe secrets on the Railway `sync` service without echoing
# them. Run after stripe-setup.ts (or stripe-connect.sh) and after rolling any
# secret that was ever displayed.
set -euo pipefail
cd "$(dirname "$0")/../.."
printf 'Stripe LIVE secret key (hidden), then Return: '; IFS= read -rs KEY; echo
printf 'Webhook signing secret whsec_… (hidden), then Return: '; IFS= read -rs WH; echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"; WH="$(printf '%s' "$WH" | tr -d '[:space:]')"
case "$KEY" in sk_live_*|sk_test_*) ;; *) echo "That is not a Stripe secret key."; exit 1;; esac
case "$WH" in whsec_*) ;; *) echo "That is not a webhook signing secret."; exit 1;; esac
railway variables --service sync --set "STRIPE_SECRET_KEY=$KEY" --set "STRIPE_WEBHOOK_SECRET=$WH" >/dev/null
echo "Set. Railway is redeploying the sync service with billing enabled."
