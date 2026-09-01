# A3 — Stripe, live  `wayfinder:task`

status: **owner-gated** · map 4 · spec §12

Agent side: `server/scripts/stripe-setup.ts` creates "Maru Sync" and the two
prices; the webhook route; portal configuration in the script.
Owner side (queue): create the Stripe account under the LLC, run the script
with a live key, paste the four env values into Railway, add the webhook
endpoint `https://sync.getmaru.app/v1/billing/webhook`, turn on Stripe Tax and
register where required, two-factor on.
Refund text: on request within fourteen days of the first charge.
