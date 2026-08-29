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
  attachments?: ComposeDraft['attachments']
}): ComposeDraft {
  return {
    accountId: 'demo-work',
    to: fields.to,
    cc: fields.cc ?? [],
    bcc: [],
    subject: fields.subject,
    bodyHtml: fields.bodyHtml,
    attachments: fields.attachments ?? [],
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
      // One small attachment, so the approval card's file row — what would
      // actually leave the machine — is a capturable state (M9).
      attachments: [
        {
          filename: 'p95-after-cache.png',
          mimeType: 'image/png',
          dataBase64: 'iVBORw0KGgoAAAANSUhEUg'.repeat(64),
        },
      ],
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
 * The trail. Twenty-five rows across yesterday and this morning, in the order
 * they happened — two connections, a triage pass over both accounts, one send
 * the human approved, one send the grant model refused, and this morning's two
 * requests still waiting.
 *
 * Every summary is written in the exact voice the M3 tools write in, because
 * the timeline never re-phrases a row: what a fixture shows is what a real
 * agent's morning looks like, or the capture is showing a surface that does
 * not exist. `tool` matches the real tool names for the same reason.
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
    hoursAgo: 25.7,
    tool: 'connected',
    summary: 'Scout connected over the local gateway socket.',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.6,
    tool: 'wren_ping',
    summary: 'Checked its connection and capabilities.',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.5,
    tool: 'search_mail',
    summary: 'Searched for \u201cis:unread newer_than:1d\u201d. 14 threads matched.',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.4,
    tool: 'read_thread',
    summary: 'Read \u201cDependency advisory \u2014 action needed\u201d.',
    threadKey: 'demo-work/w-security',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.35,
    tool: 'modify_labels',
    summary: 'Starred \u201cDependency advisory \u2014 action needed\u201d.',
    threadKey: 'demo-work/w-security',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.3,
    tool: 'archive_thread',
    summary: 'Archived \u201cLAST CHANCE: 40% off everything\u201d.',
    threadKey: 'demo-personal/p-trash-promo',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.2,
    tool: 'archive_thread',
    summary: 'Archived \u201cMembership renews on the 1st\u201d.',
    threadKey: 'demo-personal/p-gym',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.15,
    tool: 'get_attachment',
    summary: 'Downloaded \u201cinvoice-40812.pdf\u201d (86 KB) from \u201cOrder #40812 confirmed\u201d.',
    threadKey: 'demo-personal/p-order',
    outcome: 'ok',
  },
  {
    hoursAgo: 25.1,
    tool: 'modify_labels',
    summary: 'Marked \u201cRenewal quote \u2014 observability\u201d as read.',
    threadKey: 'demo-work/w-vendor',
    outcome: 'ok',
  },
  {
    hoursAgo: 25,
    tool: 'draft_reply',
    summary: 'Drafted a reply to \u201cMoving standup to 09:45\u201d.',
    threadKey: 'demo-work/w-standup',
    outcome: 'ok',
  },
  {
    hoursAgo: 24.9,
    tool: 'request_send',
    summary: 'Asked to send \u201cRe: Moving standup to 09:45\u201d to dev.raman@fernwood.dev.',
    threadKey: 'demo-work/w-standup',
    outcome: 'pending',
  },
  {
    hoursAgo: 22,
    tool: 'send',
    summary: 'You approved \u201cRe: Moving standup to 09:45\u201d to dev.raman@fernwood.dev. Sent.',
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
    hoursAgo: 19.8,
    tool: 'list_pending',
    summary: 'Checked its own send requests. 0 still waiting.',
    outcome: 'ok',
  },
  {
    hoursAgo: 3,
    tool: 'connected',
    summary: 'Scout connected over the local gateway socket.',
    outcome: 'ok',
  },
  {
    hoursAgo: 2.9,
    tool: 'list_accounts',
    summary: 'Listed 2 accounts.',
    outcome: 'ok',
  },
  {
    hoursAgo: 2.7,
    tool: 'search_mail',
    summary: 'Searched for \u201cnewer_than:12h\u201d. 6 threads matched.',
    outcome: 'ok',
  },
  {
    hoursAgo: 2.6,
    tool: 'read_thread',
    summary: 'Read \u201cp95 latency after the cache change\u201d.',
    threadKey: 'demo-work/w-latency',
    outcome: 'ok',
  },
  {
    hoursAgo: 2.5,
    tool: 'read_thread',
    summary: 'Read \u201cDesign review: settings surface\u201d.',
    threadKey: 'demo-work/w-design-review',
    outcome: 'ok',
  },
  {
    hoursAgo: 1.4,
    tool: 'get_attachment',
    summary:
      'Downloaded \u201clanternhouse-msa-redlines.pdf\u201d (393 KB) from \u201cContract redlines \u2014 Lanternhouse\u201d.',
    threadKey: 'demo-work/w-contract',
    outcome: 'ok',
  },
  {
    hoursAgo: 0.9,
    tool: 'archive_thread',
    summary: 'Archived \u201cYour Alderfly Air itinerary \u2014 SFO to PDX\u201d.',
    threadKey: 'demo-personal/p-flight',
    outcome: 'ok',
  },
  // The two rows the approval queue is showing. A fixture whose timeline and
  // whose queue disagree is a fixture that teaches the wrong thing.
  {
    hoursAgo: 0.79,
    tool: 'draft_reply',
    summary: 'Drafted a reply to \u201cp95 latency after the cache change\u201d.',
    threadKey: 'demo-work/w-latency',
    outcome: 'ok',
  },
  {
    hoursAgo: 0.783,
    tool: 'request_send',
    summary:
      'Asked to send \u201cRe: p95 latency after the cache change\u201d to dev.raman@fernwood.dev.',
    threadKey: 'demo-work/w-latency',
    outcome: 'pending',
  },
  {
    hoursAgo: 0.21,
    tool: 'draft_reply',
    summary: 'Drafted a reply to \u201cDesign review: settings surface\u201d.',
    threadKey: 'demo-work/w-design-review',
    outcome: 'ok',
  },
  {
    hoursAgo: 0.2,
    tool: 'request_send',
    summary: 'Asked to send \u201cRe: Design review: settings surface\u201d to maya@fernwood.dev.',
    threadKey: 'demo-work/w-design-review',
    outcome: 'pending',
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
