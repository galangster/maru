# Security

## Reporting

Email the maintainer (address on the GitHub profile) or open a GitHub
security advisory on this repository. Please do not open a public issue
for anything exploitable. You will get a human reply; there is no bounty
program, only gratitude and a fast fix.

## What Wren trusts, in one page

Wren is local-first: the app talks to Google's APIs and to nothing else.
There is no Wren server, no telemetry, and no network listener. The full
model is specified in [docs/PERMISSION-MODEL.md](docs/PERMISSION-MODEL.md);
the load-bearing facts:

- **The agent gateway** listens on a unix domain socket (`0600`, in a
  `0700` directory) or an owner-ACL named pipe — never a TCP port. Any
  process running as your user can reach the socket; that is the trust
  boundary, and it is the same one your keychain already lives behind.
- **Agent credentials** are bearer tokens. Wren stores only SHA-256
  digests; the token itself exists in your agent's config. Anything that
  can read that config can act as that agent — revoke the agent in
  Settings → Agents the moment you suspect a leak (it bites on the next
  call, no restart).
- **No grant lets an agent send mail.** The widest grant queues a message
  for your approval; a human taps every send in Wren's own UI.
- **Every call and every refusal is audited**, append-only, per agent.
- **OAuth tokens** live in the OS keychain, never in the database, never
  in exports.

## Scope notes for researchers

The interesting surfaces are the gateway frame protocol
(`src/core/gateway-server/`, `src-tauri/src/gateway.rs`), the grant
evaluator (`src/core/agents/grants.ts` — nine rules, pure), and the HTML
mail sandbox (`src/features/reading/message-body.tsx`). Demo mode
(`?demo=1`) reaches no real data and is safe to attack freely.
