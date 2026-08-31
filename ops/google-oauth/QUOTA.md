# Google OAuth quota operations

## Launch math

The corrected launch figures come from `docs/research/shared-client-implementation-plan.md` Part 1 §7:

> For projects created on or after May 1, 2026, Google's current shared limits are 1,200,000 units per minute per project and 6,000 units per minute per user. The daily billing threshold is 80,000,000 units per project. Older active projects can remain on the previous quota model. Google says later-2026 charges will receive at least 90 days' notice. The daily threshold cannot be increased.

The same section gives Maru's working arithmetic:

> Maru limits each account to 4,500 units per minute. Project capacity is therefore about 266 simultaneously saturated accounts before other traffic. Backoff and batch pacing spread a large sync across many minutes.

> 10 units per threads.list page
> + 40 units per thread metadata fetch
> + 20 units per prefetched message body
> + small profile and label costs

> One idle account polling every minute uses about 2,880 history units per day.
>
> The threshold equals about 27,700 continuously open, idle accounts before changes or sync work.
>
> A 200,000-unit cold sync allows about 400 such syncs per day before the threshold.

These values are arithmetic examples, not usage forecasts. Actual use depends on account count, open time, thread count, mailbox changes, and body reads. Source: `docs/research/shared-client-implementation-plan.md` Part 1 §7.

The code sets the per-account budget to 4,500 units per minute. It meters each Gmail method with the costs in `QUOTA_COST`. Sources: `src/core/gmail/limiter.ts:1-7` and `src/core/gmail/api.ts:46-66`.

## Production dashboards and alerts

Configured 2026-08-30 via `ops/google-oauth/monitoring/apply.sh` (idempotent,
re-runnable). Definitions live in that directory; this section records the
deployed state.

**Dashboard** — "Maru Gmail API quota", id
`93c11e61-4b20-4ea4-961a-71d8de974571`, project `maru-mail-prod`.
Four widgets: units per minute with the 1,200,000 limit and 50/70/90%
threshold lines; units per day with the 80,000,000 threshold and 50/70/90%
lines; responses by code class; per-user quota-exceeded events.
`«NICK: attach a current dashboard screenshot at submission time — pre-launch
charts show no data, so capture after first real traffic or note the zero
state.»`

**Quota alerts** — seven enabled policies, all notifying the email channel
"Maru ops email" → support@getmaru.app (forwards via ImprovMX, verified
2026-08-30):

| Policy | Threshold | Window |
| --- | --- | --- |
| Maru Gmail minute quota 50% (600k units-min) | 600,000 | 60s ALIGN_SUM |
| Maru Gmail minute quota 70% (840k units-min) | 840,000 | 60s ALIGN_SUM |
| Maru Gmail minute quota 90% (1.08M units-min) | 1,080,000 | 60s ALIGN_SUM |
| Maru Gmail daily units 50% (40M units-day) | 40,000,000 | 86400s ALIGN_SUM |
| Maru Gmail daily units 70% (56M units-day) | 56,000,000 | 86400s ALIGN_SUM |
| Maru Gmail daily units 90% (72M units-day) | 72,000,000 | 86400s ALIGN_SUM |
| Maru Gmail API 4xx spike | >1/s over 300s | 300s ALIGN_RATE |

Metric: `serviceruntime.googleapis.com/quota/rate/net_usage` filtered to
`gmail.googleapis.com/total_query_cost`; the 4xx policy uses
`serviceruntime.googleapis.com/api/request_count` with
`response_code_class="4xx"`.

`«NICK: alert test result — record the first real or synthetic alert fire.
Pre-launch traffic is zero, so no test has fired yet.»`

**OAuth and project-state alerts** — the 4xx spike policy covers OAuth 403,
Gmail 403, and 429 spikes at the project level (invalid_client,
unauthorized_client, and deleted_client all surface as 4xx responses).
Dedicated log-based alerts for project-state changes (project deletion,
consent-screen edits) are NOT yet configured — open follow-up in
`wayfinder/NICK-QUEUE.md`. Escalation owner: Nick (nicholasgalang@gmail.com).

`«NICK: billing gate — record the decision after Google publishes the price schedule and before any billing account is attached.»`

Cloud budgets are alerts. They do not guarantee a charge stop. Source: `docs/research/shared-client-implementation-plan.md` Part 1 §7.

## What Maru does under HTTP 429

Maru uses one token bucket per account. The bucket has a 4,500-unit capacity and refills at 4,500 units per minute. A request waits until its estimated method cost is available. Sources: `src/core/gmail/api.ts:171-185` and `src/core/gmail/limiter.ts:19-72`.

For a normal Gmail request, HTTP 429 is retryable. Maru uses exponential backoff with jitter. The default starts from 500 milliseconds, caps the nominal delay at 32 seconds, and makes at most five attempts. After the last failed attempt, Maru returns the `HttpError`. Sources: `src/core/gmail/limiter.ts:79-105` and `src/core/gmail/limiter.ts:107-155`.

For an inner request in a Gmail batch, Maru retries only the parts that returned 429 or a 5xx response. It waits between rounds and permits four retry rounds after the first batch round. If parts remain throttled, it throws an HTTP 429 error. Sources: `src/core/gmail/api.ts:289-359`.

Batch chunks contain at most ten inner requests. The smaller burst limits the per-user spike from batched reads. Source: `src/core/gmail/api.ts:8-13` and `src/core/gmail/api.ts:40-44`.

After retries fail, the sync engine reports an error state to the local UI. Maru has no telemetry service that reports the event to the project operator. Sources: `src/core/sync/engine.ts:111-120`, `src/core/sync/engine.ts:197-203`, and `SECURITY.md:10-14`.

> NOTE: Maru enforces a per-account quota budget. It does not enforce the shared project limit in the desktop clients. Cloud dashboards, staged cohorts, and operator alerts must control aggregate launch traffic. Source: `src/core/gmail/api.ts:171-185` and `docs/research/shared-client-implementation-plan.md` Part 1 §7.

## Response actions

When minute usage reaches an alert threshold:

1. Stop cohort expansion.
2. Check whether cold sync or routine polling causes the increase.
3. Reduce prefetch and polling before requesting a minute-quota adjustment.
4. Keep the 4,500-unit per-account budget.
5. Resume expansion only after two stable quota windows.

When daily usage approaches the threshold, Nick chooses whether to accept billing exposure, reduce sync cost, limit rollout, or return affected users to BYO OAuth. Source: `docs/research/shared-client-implementation-plan.md` Part 1 §7 and Part 2 §12-§13.
