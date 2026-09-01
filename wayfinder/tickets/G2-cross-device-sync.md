# G2 — Cross-device settings sync  `wayfinder:grilling`

status: DESIGNED (2026-08-31) · claimed: — · blocked by: one owner decision on liability appetite

## The ask

Nick, 2026-08-29: "sync accounts with the least amount of friction as
possible across devices. i login to my Wren account on one device that has
all my settings and stored things, and then i can login on another device
and everything is there, magically."

## Why this is a grilling ticket, not a task

The ask as phrased — *a Wren account you log into* — collides with two
ratified positions: README's "local-first, no third-party servers" and map
2's out-of-scope line "anything requiring Wren servers." Agent credentials
and grants are also part of "settings" now, and syncing a trust store is a
security decision, not a convenience one. The destination may well be
right; the mechanism needs Nick's eyes on the trade before anyone builds.

Options to grill through, roughly cheapest-first:

1. **Settings export/import** — a signed file (or QR handoff) carrying
   settings, theme, keybindings, per-view prefs. No servers, no account.
   Least magic, least friction *at setup time only*.
2. **Syncthing-style user-owned transport** — sync a settings document via
   the user's own Drive/iCloud/file sync. Local-first preserved; "log in"
   becomes "point both devices at the same folder." Gmail account OAuth
   still happens per device (tokens must not leave the keychain).
3. **A Wren sync service** — the ask taken literally. Real accounts, real
   servers, real liability (and the open-source story changes: who runs
   it?). Would need its own map; explicitly out of scope today.

Hard constraints whatever wins: OAuth tokens and agent credentials stay in
the OS keychain and never sync; mail itself never syncs (each device
resyncs from Gmail); agent grants sync only with an explicit, per-device
consent step — a grant is a trust decision made on one machine.

Owner gates: which option; whether "Wren account" is worth reopening the
no-servers line; where agent grants sit.

## Resolution (grill 3, 2026-08-29)

Both, in sequence — and the collision with the no-servers line resolved
by making the server the business: option 1 (settings export/import)
ships free in map 3 as ticket P5; option 3 (a hosted Wren sync service)
is the ratified subscription spine and map 4's product build. The hard
constraints stand verbatim: tokens and credentials never leave the
keychain, grants never sync, mail never syncs. Option 2 (user-owned
transport) dies — it is the worst of both without the business.


## Reopened — owner ruling, 2026-08-31

Nick: "yeah whatever we need to do to change what we have already,
that's what i want. a single unified sign in basically where i can
universally access my accounts on any device."

That settles the question grill 3 left open: option 3 (a hosted Maru
account) is the destination, and the no-servers line yields to it. It
is map 4's build and it stays sequenced after the Google submission.

### The one thing this ruling does NOT yet settle

Grill 3's hard constraints were: **tokens never leave the keychain,
mail never syncs, grants never sync.** "Universally access my accounts"
can mean either of two things, and they are very different products:

**(a) The account LIST syncs; each device still authorises.** You sign
into Maru on Windows, it already knows you have four Gmail accounts and
all your settings, and it walks you through one Google consent per
account. Friction: four clicks, once per device. Tokens stay in each
machine's keychain, the dossier's claims stand unchanged, and nothing
about the Google review posture moves.

**(b) The TOKENS sync too.** Sign in once, mail is simply there. This
means Maru's server holds — or brokers — credentials that grant
mailbox access. That is a different security posture, a different
liability, and it is very likely a different conversation with Google:
token handling and storage is exactly what OAuth verification scrutinises.
It also breaks the sentence the dossier currently makes.

**(a) gets most of the "magically, everything is there" feeling for
almost none of the risk** — the part that actually hurts today is
re-configuring settings, accounts and prefs, not clicking Allow once.
Recommend (a) for map 4, with (b) as an explicit later decision if the
one-consent-per-device step proves to be the thing people complain
about.

Owner gate: (a) or (b). Do not build until this is answered — it
determines whether the sync service ever touches a credential, which is
the difference between a settings service and a custodian.


## Design verdict, 2026-08-31 (judged panel: conservative / novel / adversarial)

**Recommendation: ship the settings-and-address-list sync, but build it on a
sealed envelope from day one so the credential vault is later a schema slot
rather than a rewrite.** The seam is exact: a multi-recipient sealed blob —
one random 256-bit account key, N wrapped openers (device pairing first, a
12-word recovery key second) — whose v1 payload carries settings and the
account address list, and which reserves an opaque `credentials` slot that v1
declares, never writes and never reads.

### Buildable NOW, no server, no decision — this is the real finding

`loginHint` is declared in `AuthUrlParams` (oauth.ts:123), written into the
authorize URL (:150) and **never passed at the call site (:427)**. It is
finished plumbing with no caller. Threading it through, adding an identity
assertion (if the hint was given and `users.getProfile` returns a different
address, discard the tokens and fail), batching the four flows into one
continuous browser trip, and applying restored settings before first paint
together remove most of the felt friction with no server involved at all.

### Honest friction numbers, four accounts on a fresh machine

| | browser sessions live | sessions cold (the real new-PC case) |
|---|---|---|
| settings + address list, directed consent | ~7-8 gestures | ~16-20 |
| sealed credential vault | 2-3 | 2-3 |

So the vault is worth 5 gestures in the good case and up to ~17 in the bad
one. That is more than the conservative proposals conceded, and it is the
case that matters, because a genuinely new machine is the whole reason
multi-device exists.

### Why it is still gated

Not cryptography — **build integrity and operator asymmetry.** The same one
person ships the client and runs the server, so end-to-end encryption of a
credential vault rests entirely on a supply chain that does not exist yet
(signed/reproducible builds are P2, unstarted). And an abandoned settings
server is an outage; an abandoned token vault is an unattended vulnerability
with a countdown.
There is also a sourced landmine: deleting an OAuth client invalidates every
token issued by it, and a replacement client does not repair them
(shared-client-implementation-plan.md:249-251). A hosted vault therefore makes
the entire free, local-only install base share fate with one server.
And the repo contains **no Google sentence** on whether a refresh token counts
as restricted data. The standing posture for exactly this is to request a
determination rather than assume.

Preconditions for the vault, all three: Google's verdict landed plus a written
determination on ciphertext-only credential custody; signed or reproducible
builds exist; a second durable operator has real access, not a pending invite.

### Ruled out permanently — write these into the sync spec on day one

- **(b) as written**: a server that holds refresh tokens it can read.
- **Per-user encryption with a server-held key** ("encrypted at rest"). In a
  breach it is indistinguishable from plaintext. This is the version that
  gets built by accident and described as responsible.
- **Server-side token broker** — strictly worse than (b): the server holds the
  durable credential AND sits on the hot path, so its logs carry access tokens.
- **HSM/KMS wrapping as the answer** — real only against a stolen disk; useless
  against code execution, which simply asks the HSM to decrypt.
- **Any "only for sixty seconds / only during enrolment" variant.** All of
  these are (b) with a TTL.
- **Domain-wide delegation** — does not exist for consumer accounts.
- **`prompt=none`** — yields no refresh token, so it buys a mailbox that dies
  in an hour.
- **`id_token_hint` / adding `openid`** — a scope-set change is an off-cycle
  re-review trigger (REVERIFICATION.md:77), for a benefit `login_hint` already
  gives.
- **Syncing the audit log in v1** — its content fields are mail-derived.
  `docs/research/multi-device-strategy.md:37` proposes this and is wrong; fix
  that line.
- **A relay that calls `users.watch` itself** with a server-held token — the
  back door that smuggles custody back in through a service nobody decided to
  make a custodian. The client must call watch with its own token.

### The one decision that is not a designer's

**Are you willing to be the custodian of other people's live mailbox
credentials?** It is a liability-appetite question, not a security question
with a right answer. What you buy is 5-17 fewer gestures per new device,
forever. What you accept is that a compromise of your server *or* your build
pipeline, at any point for as long as the service exists, means writing to
every subscriber a sentence you cannot soften: someone may have read every
email in your accounts and may have sent mail as you.

---

## OWNER RULING, 2026-08-31: (b). The tokens sync.

Nick, asked directly to choose between (a) the account list syncing with a
per-device Google consent, and (b) the credentials syncing so one sign-in
brings the mail with it: **"yeah i like b"**.

He was shown the gate before ruling — that the objection is not
cryptography but build integrity and operator asymmetry, that one person
ships the client and runs the server, and that an abandoned token vault is
an unattended vulnerability rather than an outage. The ruling stands. Maru
becomes a **custodian**, and the sealed-envelope design's reserved
`credentials` slot is now a v1 requirement rather than a schema
placeholder.

This does not change the sequencing: it is still map 4, still after the
Google submission. What it changes is what must be true *before* that
build starts, and what must be said *during* the submission.

### Four public claims this ruling makes false, and the one that is urgent

These are all TRUE TODAY and stay true until the vault ships. They are
listed because shipping (b) without changing them in the same release is
how a privacy promise becomes a lie by omission.

| Where | Claim | Under (b) |
|---|---|---|
| `README.md:5-6` | "local-first, no third-party servers, talks only to Google" | false |
| `README.md:17` | "talks only to Google" | false |
| `site/index.html:46` | "Maru phones home to no one. The only network peer for your mail is Google." | false |
| `docs/security/google-oauth-verification-answers.md:79` | "OAuth tokens also stay in the keychain" | false |

The dossier's opening claim — "Maru operates no server that receives Gmail
**content**" — survives literally, because tokens are not content. It
should still be rewritten rather than leaned on. A sentence that is true
only on a technicality is worse than one that is plainly false, because it
reads as evasion when someone works it out.

**The urgent one is the dossier**, because a verification submission is in
flight. Two consequences, in order:

1. **Ask Google now, not later.** The repo has never contained a Google
   sentence on whether a stored refresh token counts as restricted data
   under their policy — the design verdict flagged the absence. Under (a)
   that question was optional. Under (b) it is load-bearing, and it is far
   cheaper to ask inside an open review than to ship a vault and discover
   the answer through an enforcement action. The dossier already asks one
   open question ("we request confirmation whether this architecture
   requires a security assessment"); this belongs beside it.
2. **Do not silently amend the reviewed architecture.** If the submission
   is approved describing local-only tokens and the vault ships after,
   that is a material change to what was reviewed. Either disclose the
   roadmap in the submission or plan a re-review.

### Prerequisites the ruling creates

- **P2 signed and reproducible builds move from "nice" to blocking.** The
  entire safety of a client-side-encrypted vault is the claim that the
  client the user runs is the client whose source they can read. Without
  reproducible builds, "end-to-end encrypted" is an assertion by the one
  person who also operates the server. This is now on map 4's critical
  path, not map 3's polish list.
- **The shared-fate landmine gets worse.** Deleting an OAuth client
  invalidates every token it ever issued, and a replacement client does
  not repair them (`shared-client-implementation-plan.md:249-251`). With a
  hosted vault, one server mistake takes out the free local-only install
  base too. Needs an explicit blast-radius answer before build.
- **A recovery story is now mandatory.** The design's 12-word recovery key
  stops being an option: with (b), losing every paired device means losing
  access to the vault, and the vault is the only way onto a new machine.
- **Grants still never sync.** Grill 3's constraint is untouched by this
  ruling — a grant is a trust decision made on one machine.

### Still open, and now sharper

`mail never syncs` survives: each device still resyncs from Gmail. Worth
confirming that stays true under (b), because once credentials are on a
server the temptation to cache "just the headers" is exactly how a
local-first client stops being one.
