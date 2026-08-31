# P19 — Sync waits six seconds for the search index  `wayfinder:task`

status: open · claimed: — · found: 2026-08-31, measured on Nick's own mailbox

## What was measured

From `~/Library/Logs/dev.wren.app/Maru.log`, twice in one session:

```
[19:11:16][sqlx::query][WARN] slow statement: execution time exceeded alert
threshold summary="SELECT * FROM threads …"
db.statement="SELECT * FROM threads ORDER BY last_message_at DESC"
rows_returned=3607 elapsed=6.201356167s slow_threshold=1s
```

An earlier pair of the same statement measured 1.54s. Same query, same
mailbox, four times the wall clock — so this is not a stable cost, and it
gets worse under whatever else the machine is doing at launch.

3607 threads is Nick's real mailbox after three days of use. It is not a
stress case; it is the ordinary one, and it grows every day.

## Why it is worse than a slow query

`RealMailService.start()` in `src/core/service/real.ts:134`:

```ts
const [threads, settings, accounts] = await Promise.all([
  this.store.allThreads(),      // ← all 3607, each row decrypted
  this.store.getSettings(),
  this.store.listAccounts(),
])
for (const account of accounts) {
  const runtime = await this.attach(account, settings)
  if (this.autoStart) this.beginSync(runtime, settings)   // ← gated behind it
}
this.indexReady = this.buildIndex(threads)
```

The `await` on that `Promise.all` is what hurts. `allThreads()` is only
needed by `buildIndex` on the **last line**, but because it shares the
`Promise.all` with the two reads the account loop genuinely needs, **no
account starts syncing until every thread is loaded and decrypted**.

So the six seconds are not six seconds of a slower search box. They are six
seconds before Maru asks Google for mail at all, on every single launch.

The comment above it says the batch exists so "the window opens a full SQLite
round trip sooner" — true for the two small reads, and exactly backwards for
the big one.

`allThreads()` also does `Promise.all(rows.map(decryptThreadRow))` —
3607 decrypts materialised at once, which is where the variance likely lives.

## The shape of the fix

`allThreads()` has exactly one caller (`real.ts:136`), so this is a contained
change.

- Take `allThreads()` out of the `Promise.all`. Keep the batch for
  `getSettings` + `listAccounts`, start the account loop on those two, and let
  the index build from its own un-awaited promise. Sync then begins in
  milliseconds and the index lands when it lands — which is already the
  contract, since `indexReady` is a promise nothing blocks on.
- Then make the index build cheaper rather than just later: the index needs
  far less than `SELECT *` returns. Select only the columns `buildIndex`
  reads, and check whether those columns need decrypting at all.

**The sort is already ruled out**, so do not spend time there. Checked on the
live database, 2026-08-31:

```
sqlite> EXPLAIN QUERY PLAN SELECT * FROM threads ORDER BY last_message_at DESC;
`--SCAN threads USING INDEX idx_threads_recent
```

`idx_threads_recent (last_message_at DESC)` exists and the planner uses it —
there is no sort step to remove. The whole cost is materialising 3607 rows and
running `decryptThreadRow` on every one, which also explains the 1.5s → 6.2s
variance: it is CPU work competing with everything else at launch, not I/O.
That points the fix at decrypting less, or decrypting lazily, rather than at
the SQL.

## Proof required

Log the elapsed time from process start to the first `beginSync` call, on
Nick's real 3607-thread mailbox, before and after. The claim to defend is
"sync starts in under 250 ms", not "the query got faster".

Add a regression gate: seed a store with a few thousand synthetic threads and
assert `start()` reaches `beginSync` without awaiting the index.

## Sequencing

Not a freeze blocker — it is a cold-start delay, not a defect in what the app
shows. But it is on the demo path: a recording that opens the app and waits
six seconds for mail to move is a bad first frame, so it is worth doing
before the video rather than after.
