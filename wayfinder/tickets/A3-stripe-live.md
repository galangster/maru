# A3 — Stripe, live  `wayfinder:task`

status: **owner-gated** · map 4 · spec §12

Agent side: `server/scripts/stripe-setup.ts` creates "Maru Sync" and the two
prices; the webhook route; portal configuration in the script.
Owner side (queue): create the Stripe account under the LLC, run the script
with a live key, paste the four env values into Railway, add the webhook
endpoint `https://sync.getmaru.app/v1/billing/webhook`, turn on Stripe Tax and
register where required, two-factor on.
Refund text: on request within fourteen days of the first charge.

## Live — 2026-09-02

Nick created the Stripe account and a standard secret key; the setup script
created product "Maru Sync", prices `price_1UB6LY9GRlyl1yugHzLceThn`
(monthly) and `price_1UB6LZ9GRlyl1yugQuUmI3tx` (yearly), and the webhook
endpoint; the two secrets went into Railway through
`server/scripts/stripe-secrets.sh` (a displayed webhook secret was rolled
first). Stripe Tax is on. **Proof**: the live billing probe
(`MARU_LIVE_MODE=billing`) signs up a comped account, receives a real
`checkout.stripe.com` URL for monthly and yearly and a `billing.stripe.com`
portal URL, then deletes itself; an unsigned POST to the webhook is rejected
with 400. One defect found and fixed by the probe: Stripe Tax needs
`customer_update.address = auto` on Checkout. Not yet exercised: a paid
subscription end to end (needs a real card; do it once with a 100%-off coupon
or a $5 charge refunded).
