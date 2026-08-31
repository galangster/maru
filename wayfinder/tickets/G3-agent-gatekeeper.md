# G3 — The agent gatekeeper  `wayfinder:grilling`

status: open · claimed: — · blocked by: needs a Wayfinder + grill session

## The ask

Nick, 2026-08-31, off a post he saw (10:54 AM, 2026-08-30, 331.9K views):

> "I think cold email is going to die. Every email inbox will have an
> agent gatekeeper soon, and the only way through will be a warm intro
> or being interesting enough that the agent decides you're worth its
> person's time."

His framing: "this is a cool feature. obviously we will need to charge
something for people to use this feature, but could be a fun thing to
add. filter out spam, automagically suggest and remove a user from
unneeded marketing emails, etc. there's a bevy of things we can do a la
Arc Browser or Dia browser to improve the lives of people and the
overall experience."

## Why this is a grilling ticket and not a task

Every other agent feature in Maru acts on the user's instruction and
asks permission before it sends. A gatekeeper is the first one that
would decide **what reaches the user at all** — an authority over
attention rather than over actions. That is a different product, and it
collides with three ratified positions at once. None of them is fatal;
all of them need Nick's eyes before anyone builds.

**1. The local-first line, and this is the sharp one.** README and map 2
say nothing leaves the machine except what goes to Google. Judging
whether a message is "interesting enough" is an LLM call. Either it runs
locally — small model, slow, weaker judgement — or message content goes
to an inference provider, which contradicts the sentence the whole
verification dossier is built on. The paid-service answer from G2 ("make
the server the business") may extend here, but sending *mail content*
off-device is a much bigger step than syncing *settings*, and the
privacy story is the product.

**2. False negatives are invisible by construction.** You cannot notice
mail you were never shown. Every other Maru action is reversible and
audited; a gatekeeper's mistakes are silent. What is the review surface
— a "held back" folder, a daily digest, a confidence threshold the user
sets? What is the audit trail, given the audit timeline currently
records what an agent *did*, not what it *withheld*?

**3. Unsubscribing is an action, not a filter.** "Automagically remove a
user from unneeded marketing emails" means following List-Unsubscribe
links or sending mail — a real outbound action on the user's behalf, in
an app whose pitch is that you approve every send. Does it ride the
existing approval queue, get a standing grant, or a new consent class?

## What to grill

- **Authority model.** Does the gatekeeper hide, defer, or only rank?
  Ranking is a much smaller trust ask than hiding and gets most of the
  value. Is "hide" ever on the table, and if so with what recourse?
- **Where inference runs**, and whether a paid tier changes the answer.
  If content leaves the device, what exactly leaves — full bodies,
  headers only, embeddings? Does the verification dossier need to say
  so, and does it change the Google review posture mid-submission?
- **Pricing unit.** Nick says charge. Per seat, per month, metered by
  volume? Does it fold into map 4's sync subscription or stand alone?
  Inference is a real marginal cost — the first feature Maru has with
  one.
- **The unsubscribe action's consent class.**
- **What "warm intro" means for a mail client** — does Maru know the
  user's contact graph, and does building one cross the same line?
- **Scope discipline.** "A bevy of things a la Arc/Dia" is a direction,
  not a feature. What is the ONE thing that earns the subscription, and
  what is explicitly not in v1?

## Where it touches what already exists

- **P15 (notification badges)** and **P17 (menu-bar quick actions)** are
  both answering "what deserves your attention" with rules. A gatekeeper
  answers it with judgement. They should agree on one model rather than
  ship three.
- **The approval queue and audit timeline** are the existing consent and
  accountability surfaces; a gatekeeper either extends them or needs its
  own, and two would be worse than one.
- **Map 4's sync service** is the existing paid spine. This is the
  second candidate for it.

## Sequencing

Not before the Google verification submission — an agent that reads
everything to decide what you see is exactly the kind of scope change
that should not land while a review is open. Grill it after, then
decide whether it belongs in map 4 or a map of its own.
