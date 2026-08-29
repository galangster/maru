// Demo-mode agent fixtures — one agent, two pending sends, a two-day trail.
//
// This is what makes every M1 surface reviewable and capturable before any
// agent exists to connect. It is also the triage-morning story the map names:
// Scout read overnight mail, archived noise under its grant, drafted two real
// replies, and is waiting on a human for both.
//
// Rows are written straight to the store rather than replayed through the
// queue. A fixture seeds a *state*; running it through `submit` would stamp
// every approval with the current millisecond and put nothing in the past.

import type { ComposeDraft, EmailAddress } from '../types'
import type { AgentStore, AuditEntry, Approval } from './types'
import { hashCredential } from './registry'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Scout. The id is the hue seed — `hueFor('demo-agent-scout-1')` lands on
 * violet, which is the colour the ticket asks Scout to wear.
 */
export const DEMO_AGENT = {
  id: 'demo-agent-scout-1',
  name: 'Scout',
} as const

/**
 * A fixed token, so `verifyCredential` answers in demo mode and M2 can develop
 * its socket auth against fixtures. It is a fixture, not a secret: demo mode
 * holds no real mail and reaches no real network.
 */
export const DEMO_AGENT_CREDENTIAL = 'wren_agent_demo-scout-fixture-not-a-secret'

const ME_WORK: EmailAddress = { name: 'Nick Galang', email: 'nick.galang@gmail.com' }
const DEV: EmailAddress = { name: 'Dev Raman', email: 'dev.raman@fernwood.dev' }
const TOM: EmailAddress = { name: 'Tom Okafor', email: 'tom.okafor@northshoreapp.io' }
const MAYA: EmailAddress = { name: 'Maya Ellison', email: 'maya@fernwood.dev' }

const SANS =
  'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif'

function body(...paragraphs: string[]): string {
  return paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;${SANS};font-size:15px;line-height:1.55;color:#1f2937">${p}</p>`,
    )
    .join('')
}

function draft(fields: {
  to: EmailAddress[]
  cc?: EmailAddress[]
  subject: string
  bodyHtml: string
  reply?: ComposeDraft['reply']
}): ComposeDraft {
  return {
    accountId: 'demo-work',
    to: fields.to,
    cc: fields.cc ?? [],
    bcc: [],
    subject: fields.subject,
    bodyHtml: fields.bodyHtml,
    attachments: [],
    reply: fields.reply,
  }
}

/**
 * The two drafts waiting on a human. Both are replies into threads the fixture
 * set really holds, so approving one in the demo puts a real message into the
 * real Sent list rather than into a thread that does not exist.
 */
const PENDING: { minutesAgo: number; draft: ComposeDraft }[] = [
  {
    minutesAgo: 47,
    draft: draft({
      to: [DEV],
      cc: [TOM],
      subject: 'Re: p95 latency after the cache change',
      bodyHtml: body(
        'Persisting the index between deploys sounds right to me — the cold-start tail is the only number anyone will remember.',
        'Can you put a rough size on the persisted index before Thursday? If it is under a gigabyte I would rather ship it than keep tuning the warm path.',
        'Nick',
      ),
      reply: {
        threadKey: 'demo-work/w-latency',
        messageId: 'w-latency-m2',
        mode: 'replyAll',
      },
    }),
  },
  {
    minutesAgo: 12,
    draft: draft({
      to: [MAYA],
      cc: [DEV],
      subject: 'Re: Design review: settings surface',
      bodyHtml: body(
        'Option B with the account promoted to the header is the one — it keeps the collapse and pays back the click.',
        'One thing before you stub it: the header slot needs to survive an account being removed while the surface is open. Worth deciding now rather than in review.',
        'Nick',
      ),
      reply: {
        threadKey: 'demo-work/w-design-review',
        messageId: 'w-design-review-m2',
        mode: 'replyAll',
      },
    }),
  },
]

/**
 * The trail. Thirteen rows across yesterday and this morning, in the order
 * they happened — a triage pass, one send the human approved, one send the
 * grant model refused, and this morning's two requests still waiting.
 */
interface TrailRow {
  hoursAgo: number
  tool: string
  summary: string
  threadKey?: string
  outcome: AuditEntry['outcome']
}

const TRAIL: TrailRow[] = [
  {
    hoursAgo: 25.5,
    tool: 'search_mail',
    summary: 'Searched the last 24 hours for unread mail. 14 threads matched.',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.4,
    tool: 'read_thread',
    summary: 'Read “Dependency advisory — action needed”.',
    threadKey: 'demo-work/w-security',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.3,
    tool: 'archive',
    summary: 'Archived “LAST CHANCE: 40% off everything”.',
    threadKey: 'demo-personal/p-trash-promo',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.2,
    tool: 'archive',
    summary: 'Archived “Membership renews on the 1st”.',
    threadKey: 'demo-personal/p-gym',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.1,
    tool: 'label',
    summary: 'Labelled “Renewal quote — observability” as Receipts.',
    threadKey: 'demo-work/w-vendor',
    outcome: 'ok',
  },
  {
    hoursAgo: 25,
    tool: 'draft_reply',
    summary: 'Drafted a reply to “Moving standup to 09:45”.',
    threadKey: 'demo-work/w-standup',
    outcome: 'ok',
  },
  {
    hoursAgo: 24.9,
    tool: 'request_send',
    summary: 'Asked to send “Re: Moving standup to 09:45” to dev.raman@fernwood.dev.',
    threadKey: 'demo-work/w-standup',
    outcome: 'pending',
  },
  {
    hoursAgo: 22,
    tool: 'send',
    summary: 'You approved “Re: Moving standup to 09:45” to dev.raman@fernwood.dev. Sent.',
    threadKey: 'demo-work/w-standup',
    outcome: 'ok',
  },
  {
    hoursAgo: 20,
    tool: 'request_send',
    summary: 'Blocked: rosa@quillfield.example is outside the send scope.',
    outcome: 'blocked',
  },
  {
    hoursAgo: 2.7,
    tool: 'search_mail',
    summary: 'Searched overnight mail. 6 threads matched.',
    outcome: 'ok',
  },
  {
    hoursAgo: 2.6,
    tool: 'read_thread',
    summary: 'Read “p95 latency after the cache change”.',
    threadKey: 'demo-work/w-latency',
    outcome: 'ok',
  },
  {
    hoursAgo: 2.5,
    tool: 'read_thread',
    summary: 'Read “Design review: settings surface”.',
    threadKey: 'demo-work/w-design-review',
    outcome: 'ok',
  },
  {
    hoursAgo: 0.9,
    tool: 'archive',
    summary: 'Archived “Your Alderfly Air itinerary — SFO to PDX”.',
    threadKey: 'demo-personal/p-flight',
    outcome: 'ok',
  },
]

/**
 * Seed one agent, its grants, two pending sends and the trail above.
 *
 * `now` is the app's clock — frozen for captures, live otherwise — so every
 * relative time in the queue and the timeline reads correctly either way.
 */
export async function seedDemoAgents(store: AgentStore, now: number): Promise<void> {
  await store.putAgent({
    id: DEMO_AGENT.id,
    name: DEMO_AGENT.name,
    credentialHash: await hashCredential(DEMO_AGENT_CREDENTIAL),
    createdAt: now - 9 * DAY,
  })

  // Earned autonomy, as the story tells it: reading and drafting from the
  // start, archiving added a week in, and sending last — scoped to the two
  // domains Scout has actually been corresponding with.
  const grantedAt = [now - 9 * DAY, now - 9 * DAY, now - 2 * DAY, now - 1 * DAY]
  await store.putGrant({
    agentId: DEMO_AGENT.id,
    capability: 'read',
    scope: { kind: 'all' },
    grantedAt: grantedAt[0],
  })
  await store.putGrant({
    agentId: DEMO_AGENT.id,
    capability: 'draft',
    scope: { kind: 'all' },
    grantedAt: grantedAt[1],
  })
  await store.putGrant({
    agentId: DEMO_AGENT.id,
    capability: 'archiveLabel',
    scope: { kind: 'all' },
    grantedAt: grantedAt[2],
  })
  await store.putGrant({
    agentId: DEMO_AGENT.id,
    capability: 'send',
    scope: { kind: 'domains', domains: ['fernwood.dev', 'northshoreapp.io'] },
    grantedAt: grantedAt[3],
  })

  for (const [index, item] of PENDING.entries()) {
    const approval: Approval = {
      id: `demo-approval-${index + 1}`,
      agentId: DEMO_AGENT.id,
      kind: 'send',
      payload: item.draft,
      status: 'pending',
      createdAt: now - item.minutesAgo * MINUTE,
    }
    await store.putApproval(approval)
  }

  for (const [index, row] of TRAIL.entries()) {
    await store.appendAudit({
      id: `demo-audit-${String(index + 1).padStart(2, '0')}`,
      agentId: DEMO_AGENT.id,
      at: Math.round(now - row.hoursAgo * HOUR),
      tool: row.tool,
      summary: row.summary,
      threadKey: row.threadKey,
      outcome: row.outcome,
    })
  }
}
