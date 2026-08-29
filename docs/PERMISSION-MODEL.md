# The Wren permission model

**A specification for letting agents touch a person's mailbox.**

Status: draft, version 0.1 (2026-08-29). Everything specified here is
implemented in Wren and demonstrated end-to-end by machine-verifiable tests
(see [Provenance](#10-provenance)). This document is licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — borrow it,
adapt it, cite it — independently of the code's AGPL-3.0. Its final home
(here vs a standalone repository) is still an open owner decision (G1).

This is written for people building *other* agent gateways — over mail, or
over any store of a person's data where an agent's reads are cheap and its
writes can reach strangers. Wren is the reference implementation, and mail
is the worked example throughout, but the model is not mail-specific: swap
"send" for any action that leaves the machine and the shape holds.

The key words MUST, MUST NOT, SHOULD, and MAY are used as in RFC 2119.

---

## 1. The stance

Three commitments, from which everything below is derived:

1. **Default deny.** A newly connected agent holds nothing. Every
   capability is an explicit, per-agent, revocable grant. There is no
   hierarchy in which one grant implies another, and no wildcard.
2. **A human gates egress.** No grant authorizes an agent to *dispatch*
   anything off the machine. The widest send grant authorizes an agent to
   *ask*; a person approves each message in the app's own UI before it
   leaves. There is no configuration that removes this gate.
3. **Total observability.** Every connection, every call, and every
   refusal is written to an append-only log, per agent, in language a
   person reads. An agent probing for capabilities it does not hold is
   visible in the timeline, not invisible in a return value.

The model is called **earned autonomy**: an agent gets more rope by having
behaved, the person can always see what it did, and anything granted can
be taken back with effect on the very next call.

## 2. The objects

Four objects carry the whole model:

| Object | What it is |
| --- | --- |
| **Agent** | An identity the gateway issued a credential to. |
| **Grant** | One capability that identity holds, with a scope and a timestamp. |
| **Approval** | A side effect the identity asked for, that a human must resolve. |
| **AuditEntry** | What actually happened, forever. |

And one function joins them: `evaluate(grants, capability, context) →
Decision`, the single authority on "may this agent do this, to these
recipients, now."

```
agent ──credential──▶ identity ──grants──▶ evaluate() ──▶ allowed?
                                                │
                                     send only  ▼
                                        approval queue ──human──▶ dispatch
                                                │
                              every step        ▼
                              ──────────▶  audit log (append-only)
```

## 3. Identity

**3.1.** The gateway MUST issue its own credential per agent: a random
token with at least 128 bits of entropy (Wren: 32 CSPRNG bytes,
base64url, prefixed `wren_agent_` so a leaked token is greppable). The
token is shown to the human **once**, at creation, and never stored: the
gateway keeps only a digest (Wren: SHA-256). No salt or KDF is required —
this is a high-entropy machine token, not a guessable password, and the
digest doubles as the lookup key that makes verification one indexed read.

**3.2.** A presented token resolves to an Agent through digest lookup, and
this resolution is the **only** way an agent id enters the system. The
gateway MUST NOT accept a client-supplied agent id on any call.

**3.3.** The identity a connecting MCP client claims for itself —
`clientInfo` on `initialize` — is self-reported and unauthenticated by the
protocol. It MUST be treated as a display label: recorded in the audit
log, used nowhere else. A grant that attached to a claimed name would be a
grant any process on the machine could take by typing the right string.

**3.4.** The credential MUST be resolved **once per connection**, before
any other traffic is relayed (in Wren, the token is the first frame on the
socket). Every subsequent frame on that connection is attributed to the
agent that credential resolved to. The session holds the resolved
identity; it never re-reads the token and never lets the client restate
who it is.

**3.5.** The first-ever use of a credential SHOULD be distinguished: the
connection's audit row says so in its own words, and the gateway raises an
out-of-band notice (Wren: an OS notification). A fresh credential's first
connection is the moment a copied one would surface. The notice tier is
deliberate — a blocking consent gate would park every first handshake on a
human, while a newly connected agent already holds nothing (§1.1); an
implementation MAY still gate when its threat model warrants the friction.

## 4. Capabilities and scopes

**4.1.** Wren's capability set, in increasing order of consequence:

| Capability | Authorizes | Scope |
| --- | --- | --- |
| `read` | Searching and reading mail, listing accounts, fetching attachments. | none |
| `draft` | Composing drafts. A draft is not a send; it is stored nowhere. | none |
| `archiveLabel` | Moving mail out of the inbox and changing its labels. | none |
| `send` | *Asking* to send. Queues for approval; never dispatches. | required |

The set is domain-specific; the structural requirements are not:
capabilities MUST be flat (no capability implies another — reading a
mailbox must never quietly buy the ability to write to it), and the one
capability that can reach a stranger MUST be the one that carries a scope.

**4.2.** A send scope is one of:

- `all` — any recipient. The most a person can hand over, and it still
  ends at the approval queue.
- `domains` — a list of domains. A recipient matches on its **own**
  domain, case-folded, **exactly** — never by suffix. A suffix match
  would hand `evil-example.com` a grant written for `example.com`.
- `recipients` — a list of whole addresses, case-folded.

**4.3.** Addresses are normalized (trimmed, lowercased) before any
comparison, and the empty string is admitted by **no** scope. Malformed
addresses SHOULD be rejected before scope evaluation ever sees them — in
Wren that happens at the tool layer, which parses recipients with the same
parser the human composer uses, so a chip the UI would reject is a chip
the gateway rejects. The scope matcher itself assumes parsed input.

## 5. Evaluation: the nine rules

`evaluate` MUST be a pure function of the grant rows, the capability, and
a context `{ now, agent, recipients? }` — same inputs, same answer,
forever. Purity is not a testing convenience: it is what lets an audit row
from six months ago still be explained by replaying the decision. There
MUST be exactly one implementation, consumed by everything that decides —
in Wren, the gateway's authorize path behind every tool call, and the
settings summary of what an agent holds (drawn through the same live-grant
filter). The approval queue holds no rules at all and never re-evaluates
(§6.3). A second copy of "may it send here?" is a second thing that can
disagree with the log.

The rules:

1. **A grant authorizes exactly the capability named on it.** `read`
   implies nothing else. No hierarchy, no wildcard.
2. **A revoked agent is denied every capability**, whatever its grant rows
   say. Identity revocation is checked before grants are consulted.
3. **A grant row with `revokedAt` at or before now is not a grant.**
4. **Revocation wins backwards.** Revoking a capability suppresses every
   grant of that capability issued *before* the revocation — not only the
   rows the revocation was stamped on. Restoring the capability means
   issuing a new grant dated at or after the revocation. This is the rule
   that means a person never has to hunt for a second, older grant that is
   quietly still live.
5. **A grant issued in the future is not yet a grant.**
6. **Only `send` consults the scope.** The other capabilities have no
   recipient to scope against.
7. **A send with no recipients is denied.** There is nothing to authorize.
8. **A scope admits a recipient as §4.2 defines** — `all` admits everyone;
   `domains` by exact, case-folded own-domain match; `recipients` by
   exact, case-folded whole-address match.
9. **Every recipient must be admitted by one single grant.** The list is
   the union of to, cc, and bcc. One address outside the scope denies the
   **whole** message, and two narrow grants MUST NOT be added together —
   "may send to `@a.com`" plus "may send to `@b.com`" authorizing one
   message addressed to both is a union the human never agreed to. One
   stranger on the cc line refuses the message.

A denial MUST distinguish, at minimum: *never granted*, *granted and
revoked*, *agent revoked*, *no recipients*, and *out of scope* — because
"did I refuse this, or was it never allowed?" are different conversations
for the person reading the log. An out-of-scope denial SHOULD name exactly
the addresses that failed (Wren returns them as `blocked`), so a
well-behaved agent can drop them and ask again instead of guessing — and a
probing one leaves a legible trail.

**5.1. Replacing a grant.** Changing a capability's scope MUST replace the
old grant, not accumulate beside it: revoke-then-insert, with the new row
dated at the revocation instant (rule 4 suppresses only rows *strictly
older* than the revocation, so the replacement survives without the clock
having to tick). Widening a send scope from one domain to two must not
leave the old row live beside the new one, or a later revoke of "the
grant" would reach only half of it.

## 6. The approval queue

**6.1. Why it exists at the app level.** MCP has no deferred-approval
primitive: `tools/call` is synchronous request/response with no pending
state and no callback. The spec's own human-in-the-loop answer is the
client's per-call confirmation dialog — the wrong shape for mail, because
it fires while the agent waits and shows the human a tool call rather than
a message. The queue is therefore an application-level composition:

**6.2.** `request_send` MUST return a pending approval id **immediately**
and finish. No tool call ever blocks on a person. The human resolves the
approval later, in the gateway's own UI; nothing reachable over the
protocol can approve anything.

**6.3.** The capability gate and the human gate are separate, in that
order, and the second never re-decides the first: an agent without a live
`send` grant admitting every recipient never reaches the queue at all, and
the queue never re-evaluates what `evaluate` already decided.

**6.4.** The queued payload is the draft **exactly as the agent composed
it**, and approval dispatches it unedited. An edit belongs in a deny plus
a fresh request, so the log never shows an agent "sending" words a human
wrote.

**6.5. Ordering on approval: dispatch first, mark second.** Marking
approved and then failing to send would leave a message the log says went
out and the mailbox says never did. A failed dispatch records an `error`
row and leaves the approval pending, so the human can retry.

**6.6. Denial is quiet.** The log is the record; the agent is not
notified. It can discover the outcome the same way it discovers anything
about its own requests — by asking (`list_pending`), which needs no grant:
an agent may always see the status of what it itself submitted, and only
that.

**6.7. Approvals expire.** A pending request older than a TTL (Wren: 24
hours) MUST become unactionable — the queue is a morning ritual, and
something asked for last week must not go out on a misclick. Expiry is
swept lazily, on every read of the queue and before every resolution,
rather than by a timer: a lazy sweep cannot be stale at the only moment it
matters, which is the moment somebody looks. Expiry writes its own audit
row.

## 7. Revocation

**7.1.** Two levels: a capability can be revoked (rules 3–4), and the
agent itself can be revoked (rule 2). Agent revocation is permanent — the
row survives as history so the audit log stays explainable, and the id is
never reissued.

**7.2.** Revocation takes effect **on the next call**, with no reconnect
required, because every call re-runs `evaluate` against the store. The
gateway SHOULD NOT hang up a revoked agent's connection: an open socket
whose every call is refused (and logged) is strictly more observable than
a closed one.

**7.3.** Grant rows are never deleted, only stamped. The audit trail's
explanation depends on the historical rows still existing.

## 8. The audit contract

**8.1. Append-only, per agent, in human language.** Each entry: who
(agent id), when, which tool as the agent called it, a one-line summary
**already written for a person**, an outcome, and optionally the domain
object it touched. The timeline UI MUST NOT re-phrase rows; what the log
says is what the person reads, which is why the writer writes prose, not
key-value pairs.

**8.2. One row per call — exactly one.** A success logs once; a refusal
logs once. The discipline that enforces this in Wren: authorization writes
the denial row at the moment it denies, and the shared tool path writes
the success row from what the handler returns — a handler never appends
its own. A timeline that double-counts is one nobody can read for a
number.

**8.3. Refusals are rows.** Every grant denial and every malformed call
reached through an authenticated session is logged with the reason. (Wren
has one unreachable-in-practice exception: an agent id the store has never
seen denies before the logging point — an id that can only exist if the
connection discipline in §3.4 has already been broken.) The outcome vocabulary distinguishes the machine
saying no from the human saying no:

| Outcome | Meaning |
| --- | --- |
| `ok` | It happened. |
| `pending` | Queued for a human. |
| `blocked` | The grant model said no before a human ever saw it. |
| `denied` | A human said no. |
| `expired` | No human answered within the TTL. |
| `error` | Authorized, attempted, failed. |

**8.4. The log cannot fail the action.** An append failure is swallowed
and reported out-of-band (console/telemetry); an action that happened is a
fact, and a full disk must not make it un-happen. The inverse discipline
holds too: the *denial* row is written before the refusal is returned, so
"refused but unlogged" is not a reachable state in the ordinary path.

**8.5. Sessions are audited**, not only tools: a row for `connected`
(the credential resolving) and a row for `initialize` capturing the
client's self-reported name — which is where `clientInfo` goes to be seen
and goes no further (§3.3).

**8.6. Reads are capped** (Wren: 500 rows per query) so an agent that ran
overnight cannot make the timeline unrenderable. The cap bounds a read,
never a write.

**8.7.** Polling caveat, learned in practice: any self-inspection tool
(`list_pending`) writes a row per call like everything else, so an agent
told to poll for its verdict fills the timeline with a metronome. Prompt
discipline — *request and stop; the human resolves in the app* — is part
of the model's operating manual, and Wren ships it in the triage-morning
playbook rather than special-casing the audit path.

## 9. Transport and session requirements

These bind any gateway that hosts its MCP server inside a desktop app:

- **9.1.** The channel between the stdio shim and the app MUST be a
  user-restricted local IPC endpoint — a unix domain socket with `0600`
  permissions inside a `0700` directory, or a named pipe with an
  equivalent owner-only ACL. (Wren applies these permissions at startup
  and treats a pre-existing directory it cannot tighten as the owner's
  configuration rather than refusing to start; a hardened deployment
  SHOULD verify them, and an implementation MAY fail closed.) It MUST NOT
  be a loopback TCP port: localhost
  is not an authentication story, and the DNS-rebinding advisories against
  the reference SDKs are what happens to implementations that assumed
  otherwise.
- **9.2.** The first frame of a connection is the credential; nothing else
  is relayed until it resolves (§3.4). A refused credential closes the
  connection with a distinguishable error.
- **9.3.** Frames SHOULD be size-capped (Wren: 1 MiB) and concurrent
  connections bounded (Wren: 8). A tool result that cannot fit the frame
  cap MUST be refused with the real number rather than truncated silently
  or allowed to kill the connection.
- **9.4.** One process owns the store. The app that renders the approval
  queue and the audit log is the process that decides and records — a
  second writer is a second authority.

## 10. Provenance

This model is implemented in [Wren](../README.md) (`src/core/agents/`,
`src/core/gateway-server/`) and held in place by:

- `tests/agents.test.ts` — the nine rules, one per test; replacement
  semantics; revocation-wins-backwards; queue lifecycle including expiry.
- `tests/tools.test.ts` — one-row-per-call across the tool surface,
  refusals included; grant denial for all four capabilities; the
  recipient-scope denial naming its addresses.
- `tests/smoke-live.test.ts` and `tests/triage-live.test.ts` — the model
  end-to-end over a real socket and the real shim: a full agent morning
  (survey, archive, star, drafts, one out-of-scope refusal, two human
  approvals) with the 22-row trail asserted in order. The blocked send in
  that trail — the audit row reads `Blocked: rosa@quillfield.example is
  outside the send scope.` — is rule 9 doing the one thing this document
  exists to describe.

Operating documents: [CONNECT-AN-AGENT.md](CONNECT-AN-AGENT.md) (the
user-facing contract), [TRIAGE-MORNING.md](TRIAGE-MORNING.md) (the
playbook, including the no-retry and no-poll prompt discipline §8.7
depends on).

## 11. Conformance summary

A conforming gateway:

1. issues its own per-agent credentials, stores digests only, and never
   accepts a client-supplied identity (§3);
2. treats protocol-level client identity as display-only (§3.3);
3. keeps capabilities flat and default-deny, and scopes the one that can
   reach strangers (§4);
4. answers every authorization question through one pure `evaluate` whose
   rules include revocation-wins-backwards and every-recipient-admitted
   (§5);
5. returns a pending id instead of blocking a tool call on a human, keeps
   the approval payload unedited, dispatches before marking, and expires
   the unanswered (§6);
6. makes revocation bite on the next call without a reconnect (§7);
7. logs every call, refusal, connection, and resolution exactly once,
   append-only, in human language, with machine-no distinguished from
   human-no (§8);
8. speaks only over user-restricted local IPC, authenticates the first
   frame, and lets one process own the store (§9).
