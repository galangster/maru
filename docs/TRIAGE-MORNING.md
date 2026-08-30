# The triage morning

The first thing Maru's gateway is *for*. An agent connects while you sleep,
reads the overnight mail, archives what needs nobody, stars what needs your
eyes, and drafts real replies into the approval queue. You open Maru to a
tidy inbox and a short list of sends waiting on you. Nothing left the machine
while you were away, and the audit log reads back as the whole morning in
order.

This document is the playbook for running it — against the demo first, then
against your own mail — and the runbook for filming it.

Prerequisite: an agent connected per [CONNECT-AN-AGENT.md](CONNECT-AN-AGENT.md).
Maru must be running.

---

## 1. What the agent needs to hold

Four toggles in Settings → Agents, and the story uses all of them:

- **read** — to survey the inbox and read the threads worth replying to.
- **draft** — to compose the replies.
- **archive / label** — to move the noise out and star the urgent.
- **send** — scoped. Name the domains or addresses you actually correspond
  with. The scope is the safety rail the demo shows off: a reply to anyone
  outside it is refused by name, whole-message, even from cc.

Grant less and the morning still works, smaller: without archive / label the
agent can only report the noise; without send the drafts stop at the agent's
summary instead of the queue. Every refusal lands in the audit log either
way — a capability the agent does not hold is a row saying it asked.

## 2. The prompt

Paste this into Claude Code or Claude Desktop with the `maru` server
registered. Adjust the taste lines — what counts as noise, whose threads
deserve replies — to your own mail.

```text
Good morning. Triage my inbox in Maru.

1. Call maru_ping to see what you hold, then list_accounts.
2. Call search_mail with an empty query for the newest inbox threads.
3. Archive the noise: newsletters, promotions, receipts, shipping and
   renewal notices — anything that needs no reply and no decision from
   me. Judge from the summaries; read a thread only if you cannot tell.
4. Star anything urgent or security-related that needs my eyes today.
5. For the threads that deserve a real reply from me, read the thread
   with read_thread, draft a short, concrete reply in my voice with
   draft_reply, and queue it with request_send.
6. If request_send refuses a recipient as outside your scope, skip that
   thread and note it in your summary. Do not retry it.
7. Finish with a summary: what you archived, what you starred, what is
   waiting in my approval queue, what you skipped. Then stop. I approve
   sends in Maru, not here — do not poll list_pending.
```

Two lines of that prompt are load-bearing rather than taste:

- **"Do not retry it."** The refusal already names the address that failed.
  A model that retries a blocked send fills the audit log with identical
  blocked rows and changes nothing — the scope is yours to widen, in
  Settings, if the recipient belongs there.
- **"Do not poll list_pending."** Every call writes an audit row, including
  that one. Approvals resolve in Maru's UI on your schedule; an agent that
  polls for the verdict turns the timeline into a metronome. `list_pending`
  is for the *next* session's catch-up — "what happened to what I asked?" —
  not for waiting.

## 3. What you see in Maru

- The sidebar footer badge counts the sends waiting. The OS notification
  fires as each request lands.
- `w` opens **Waiting on you** — each request shows the recipients, the
  subject, and the message itself behind "Read the message". Approve sends
  it; Deny discards it. There is no bulk approve, deliberately.
- **Audit log** (from the queue, or Settings → Agents) is the morning in
  order: every search, every archive, every draft, every refusal, every
  approval — append-only, per agent.

## 4. Proofs and the recording

Three artifacts stand behind this document:

- **The machine proof.** The whole morning as a test over the real socket
  and the real shim — survey, three archives, a star, two queued replies,
  the out-of-scope refusal, both approvals, the tidy inbox, and the trail
  asserted row by row:

  ```sh
  npx vitest run tests/triage-live.test.ts --reporter=verbose
  ```

- **The recorded demo.** `docs/captures/triage-morning-demo.webm` — the
  human's half over demo fixtures (which are staged as the morning after
  Scout's pass): inbox, `w`, read, approve, audit log. Re-record with
  `node scripts/record-triage.mjs`.

- **The live run.** Demo mode (`?demo=1`) plus Scout's printed credential,
  a real Claude, and the prompt above. No real mail is reachable, and every
  surface behaves as production does.

### Filming the full story

The film is one screen, two halves: the agent's terminal on the left, Maru
on the right. Beats:

1. Maru in demo mode, inbox untouched, badge at zero. Two seconds of calm.
2. Paste the prompt into Claude Code on the left. Let it run — the audit
   log open on the right turns the tool calls into readable rows as they
   land.
3. The badge counts up as request_send lands. The OS notification is the
   punchline of this beat if you have notifications on.
4. The agent's closing summary on the left — including the recipient it was
   refused and did not retry.
5. `w`. Read one message. Approve it — the button confirms green and the
   row leaves. Approve or deny the rest.
6. End on the audit log: scroll the morning, top to bottom.

The story the film tells is the trust model: the agent did a morning of
work, and the only thing that left the machine is what you tapped.
