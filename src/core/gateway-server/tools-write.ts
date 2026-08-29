// The write half: drafting, asking to send, and triage.
//
// Two rules shape every tool in this file.
//
// NOTHING HERE SENDS. `request_send` queues. There is no tool, no argument and
// no grant that dispatches a message straight from an agent — v1 puts every
// send in front of a person, and `AgentGateway.requestSend` is the only path
// to the queue so the grant check and the human gate cannot come apart.
//
// THE COMPOSER IS THE AUTHORITY ON REPLIES. `draft_reply` does not derive
// recipients, subjects or quote headers of its own: it calls the same pure
// helpers in src/lib/compose.ts that the reply button calls, with the same
// timestamp formatter. A second implementation of "who does reply-all go to"
// is a second answer, and the one in the agent path is the one nobody watches.

import type { Account, ComposeDraft, MailActionType } from '../types'
import { deriveRecipients, quoteOriginal, replySubject, type ReplyMode } from '../../lib/compose'
import { fullTimestamp } from '../../lib/format'
import { htmlToText } from '../mime'
import { markdownToHtml, MARKDOWN_SUBSET, textToHtml } from './body'
import { requireThread } from './tools-read'
import {
  addressesOut,
  addressList,
  clip,
  expectKeys,
  optionalString,
  quoteSubject,
  requiredEnum,
  requiredString,
  requiredText,
  resolveAccount,
  ToolRefusal,
  type Args,
  type ToolContext,
  type ToolSpec,
} from './tool-support'

const REPLY_MODES = ['reply', 'replyAll', 'forward'] as const
const ARCHIVE_ACTIONS = ['archive', 'unarchive', 'trash', 'untrash'] as const
/** The two labels Wren can actually move through `MailService.performAction`. */
const MODIFIABLE_LABELS = ['STARRED', 'UNREAD'] as const

const BODY_KEYS = ['body_markdown', 'body_text', 'body_html'] as const

const BODY_SCHEMA = {
  body_markdown: {
    type: 'string',
    description: `The message body in Markdown. Supported: ${MARKDOWN_SUBSET}. Anything else is kept as literal text. Give exactly one of body_markdown, body_text or body_html.`,
  },
  body_text: {
    type: 'string',
    description:
      'The message body as plain text. Blank lines become paragraphs. Give exactly one of body_markdown, body_text or body_html.',
  },
  body_html: {
    type: 'string',
    description:
      'The message body as HTML. Intended for handing back the body_html a draft tool returned, quoted original and all, rather than for writing HTML by hand.',
  },
} as const

/**
 * Exactly one body, converted to the HTML a ComposeDraft carries.
 *
 * Refusing two is not pedantry: a model that sent both `body_text` and
 * `body_markdown` has two different messages in mind, and silently picking one
 * would put the other in front of a human under the wrong text.
 */
function bodyHtmlFrom(args: Args, tool: string): string {
  const given = BODY_KEYS.filter((key) => args[key] !== undefined && args[key] !== null)
  if (given.length === 0) {
    throw new ToolRefusal(`${tool} needs one of body_markdown, body_text or body_html.`)
  }
  if (given.length > 1) {
    throw new ToolRefusal(
      `${tool} takes exactly one body: it was given ${given.join(' and ')}. Send one of them.`,
    )
  }
  const key = given[0]
  const value = requiredString(args, key, tool)
  if (key === 'body_html') return value
  if (key === 'body_text') return textToHtml(value)
  return markdownToHtml(value)
}

/** The normalised draft, snake_cased, exactly as `request_send` will take it. */
function draftEcho(draft: ComposeDraft, fromEmail: string) {
  return {
    account_id: draft.accountId,
    from: fromEmail,
    to: addressesOut(draft.to),
    cc: addressesOut(draft.cc),
    bcc: addressesOut(draft.bcc),
    subject: draft.subject,
    body_html: draft.bodyHtml,
    body_preview: clip(htmlToText(draft.bodyHtml), 200),
    reply: draft.reply
      ? {
          thread_key: draft.reply.threadKey,
          message_id: draft.reply.messageId,
          mode: draft.reply.mode,
        }
      : null,
  }
}

/** The `reply` block, shared by draft_reply's output and request_send's input. */
const REPLY_INPUT_SCHEMA = {
  type: 'object',
  description:
    'Set when this message answers a thread, so it threads correctly. Copy the reply block a draft tool returned.',
  properties: {
    thread_key: { type: 'string', description: 'The thread being answered.' },
    message_id: { type: 'string', description: 'The message in it being answered.' },
    mode: { type: 'string', enum: [...REPLY_MODES], description: 'How it was composed.' },
  },
  required: ['thread_key', 'message_id', 'mode'],
  additionalProperties: false,
} as const

function replyBlockFrom(args: Args, tool: string): ComposeDraft['reply'] {
  const raw = args.reply
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ToolRefusal(`${tool} needs reply as an object with thread_key, message_id and mode.`)
  }
  const block = raw as Args
  expectKeys(`${tool}'s reply`, block, ['thread_key', 'message_id', 'mode'])
  return {
    threadKey: requiredText(block, 'thread_key', tool),
    messageId: requiredText(block, 'message_id', tool),
    mode: requiredEnum(block, 'mode', tool, REPLY_MODES),
  }
}

/**
 * A whole draft out of arguments — `draft_new`'s job, and `request_send`'s.
 *
 * The resolved account comes back with it rather than being looked up again
 * for the `from` line: one `listAccounts` per call, not two.
 */
async function draftFromArgs(
  ctx: ToolContext,
  args: Args,
  tool: string,
): Promise<{ draft: ComposeDraft; account: Account }> {
  const accounts = await ctx.mail.listAccounts()
  const account = resolveAccount(accounts, optionalString(args, 'account_id', tool), tool)
  const to = addressList(args, 'to', tool)
  const cc = addressList(args, 'cc', tool)
  const bcc = addressList(args, 'bcc', tool)
  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    throw new ToolRefusal(`${tool} needs at least one recipient in to, cc or bcc.`)
  }
  return {
    draft: {
      accountId: account.id,
      to,
      cc,
      bcc,
      subject: requiredString(args, 'subject', tool),
      bodyHtml: bodyHtmlFrom(args, tool),
      attachments: [],
      reply: replyBlockFrom(args, tool),
    },
    account,
  }
}

// -- draft_new ----------------------------------------------------------------

const DRAFT_NEW_KEYS = ['account_id', 'to', 'cc', 'bcc', 'subject', ...BODY_KEYS]

const draftNew: ToolSpec = {
  capability: 'draft',
  tool: {
    name: 'draft_new',
    title: 'Draft a new message',
    description:
      'Compose a new message and get it back normalised: recipients parsed and validated, sending account resolved, body converted to HTML. Nothing is sent and nothing is stored — this is the check-my-work step before request_send, which takes the same fields.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description:
            'The account to send from, from list_accounts. Optional when Wren has exactly one account; required when it has several.',
        },
        to: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Recipients, each as name@example.com or Name <name@example.com>. Every address is validated and a bad one refuses the whole call.',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Carbon copy recipients, in the same forms as to. Optional.',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Blind carbon copy recipients. These count against a send grant’s scope exactly like to and cc.',
        },
        subject: { type: 'string', description: 'The subject line, as the recipient will see it.' },
        ...BODY_SCHEMA,
      },
      required: ['to', 'subject'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Draft a new message',
      // Honest: a draft changes nothing. Wren has no draft store in v1, so the
      // normalised message comes back to the agent and lives nowhere else.
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async handler(ctx, args) {
    expectKeys('draft_new', args, DRAFT_NEW_KEYS)
    const { draft, account } = await draftFromArgs(ctx, args, 'draft_new')

    return {
      payload: {
        draft: draftEcho(draft, account.email),
        note: 'Nothing has been sent or saved. Pass these fields to request_send to put it in front of a person.',
      },
      audit: {
        summary: `Drafted ${quoteSubject(draft.subject)} to ${draft.to.map((a) => a.email).join(', ') || '(no recipient)'}.`,
      },
    }
  },
}

// -- draft_reply --------------------------------------------------------------

const draftReply: ToolSpec = {
  capability: 'draft',
  tool: {
    name: 'draft_reply',
    title: 'Draft a reply',
    description:
      'Compose a reply, reply-all or forward on an existing thread. Wren resolves the recipients, the Re:/Fwd: subject and the quoted original exactly as its own reply button does — you supply only the new text. Nothing is sent and nothing is stored; pass the returned fields to request_send.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_key: {
          type: 'string',
          description: 'The thread to answer, from search_mail. The newest message is answered.',
        },
        mode: {
          type: 'string',
          enum: [...REPLY_MODES],
          description:
            'reply answers the sender; replyAll answers everyone who saw it, minus you; forward addresses nobody, so give to as well.',
        },
        to: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Only for forward, where Wren has nobody to derive. Ignored for reply and replyAll, whose recipients come from the thread.',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extra carbon copies, added to the ones Wren derived.',
        },
        ...BODY_SCHEMA,
      },
      required: ['thread_key', 'mode'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Draft a reply',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async handler(ctx, args) {
    expectKeys('draft_reply', args, ['thread_key', 'mode', 'to', 'cc', ...BODY_KEYS])
    const key = requiredText(args, 'thread_key', 'draft_reply')
    const mode: ReplyMode = requiredEnum(args, 'mode', 'draft_reply', REPLY_MODES)
    // Hydrated: the quoted original is the message body, so this is one of the
    // two calls that genuinely needs it.
    const { thread, messages } = await requireThread(ctx, key, { hydrate: true })

    // The newest message is what a reply answers and what a forward carries —
    // the same choice `useComposeActions` makes.
    const message = messages[messages.length - 1]
    if (!message) {
      throw new ToolRefusal(`${quoteSubject(thread.subject)} has no messages to answer.`, {
        threadKey: key,
      })
    }

    const accounts = await ctx.mail.listAccounts()
    const account = accounts.find((a) => a.id === thread.accountId)
    if (!account) {
      throw new ToolRefusal(
        `The account that holds ${quoteSubject(thread.subject)} is no longer connected to Wren.`,
        { threadKey: key },
      )
    }

    const derived = deriveRecipients(message, mode, accounts.map((a) => a.email))
    const to = [...derived.to, ...addressList(args, 'to', 'draft_reply')]
    const cc = [...derived.cc, ...addressList(args, 'cc', 'draft_reply')]
    if (to.length === 0) {
      throw new ToolRefusal(
        'A forward has no recipients of its own. Give to with the addresses to forward it to.',
        { threadKey: key },
      )
    }

    const draft: ComposeDraft = {
      accountId: thread.accountId,
      to,
      cc,
      bcc: [],
      subject: replySubject(thread.subject, mode),
      bodyHtml: bodyHtmlFrom(args, 'draft_reply') + quoteOriginal(message, mode, fullTimestamp),
      attachments: [],
      reply: { threadKey: thread.key, messageId: message.id, mode },
    }

    return {
      payload: {
        draft: draftEcho(draft, account.email),
        note: 'Nothing has been sent or saved. Pass these fields to request_send to put it in front of a person.',
      },
      audit: {
        summary: `Drafted ${mode === 'forward' ? 'a forward of' : 'a reply to'} ${quoteSubject(thread.subject)}.`,
        threadKey: thread.key,
      },
    }
  },
}

// -- request_send -------------------------------------------------------------

const requestSend: ToolSpec = {
  // Deliberately null. `AgentGateway.requestSend` runs the send grant against
  // every recipient and writes the row either way — checking the capability
  // here as well would evaluate the scope twice and log the refusal twice.
  capability: null,
  tool: {
    name: 'request_send',
    title: 'Ask to send a message',
    description:
      'Put a message in front of the person running Wren for approval. This never sends: it returns an approval id immediately and a human resolves it in Wren. Needs the send capability, and every recipient — to, cc and bcc — must be inside one single grant, so one address outside the scope refuses the whole message. Takes the fields draft_new or draft_reply returned.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description:
            'The account to send from. Optional when Wren has exactly one account; required when it has several.',
        },
        to: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Recipients, each as name@example.com or Name <name@example.com>. Every one of them has to be inside the send grant.',
        },
        cc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Carbon copy recipients. Scoped by the send grant exactly like to.',
        },
        bcc: {
          type: 'array',
          items: { type: 'string' },
          description: 'Blind carbon copies. Scoped by the send grant exactly like to and cc.',
        },
        subject: { type: 'string', description: 'The subject line, as the recipient will see it.' },
        ...BODY_SCHEMA,
        reply: REPLY_INPUT_SCHEMA,
      },
      required: ['to', 'subject'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Ask to send a message',
      readOnlyHint: false,
      // It queues a request. Nothing is overwritten and nothing is lost, and
      // the message itself cannot leave without a person saying so.
      destructiveHint: false,
      // Calling it twice queues two requests, and a person would see two.
      idempotentHint: false,
      // Mail reaches people outside this machine. The one tool here that does.
      openWorldHint: true,
    },
  },
  async handler(ctx, args) {
    expectKeys('request_send', args, [...DRAFT_NEW_KEYS, 'reply'])
    const { draft } = await draftFromArgs(ctx, args, 'request_send')
    const result = await ctx.gateway.requestSend(ctx.agent.id, draft)

    if ('denied' in result) {
      const decision = result.denied
      // The union carries an allowed arm that this branch cannot hold; naming
      // the fallback keeps the narrowing honest without an assertion.
      const reason = decision.allowed ? 'no-grant' : decision.reason
      const blocked = decision.allowed ? [] : (decision.blocked ?? [])
      // `authorize` inside requestSend already wrote the blocked row.
      throw new ToolRefusal(sendDenial(ctx.agent.name, reason, blocked), {
        logged: true,
        threadKey: draft.reply?.threadKey,
      })
    }

    return {
      payload: {
        approval_id: result.approval.id,
        status: result.approval.status,
        note: 'Nothing has been sent. This is waiting for a person to approve it in Wren, and expires unanswered after 24 hours. Call list_pending to see where it got to.',
        subject: draft.subject,
        to: draft.to.map((a) => a.email),
      },
      // No row: `ApprovalQueue.submit` wrote the pending one.
    }
  },
}

/** Why a send was refused, in a sentence that names what to fix. */
function sendDenial(agentName: string, reason: string, blocked: string[]): string {
  switch (reason) {
    case 'out-of-scope': {
      return `Wren refused request_send: ${blocked.join(', ') || 'a recipient'} ${
        blocked.length === 1 ? 'is' : 'are'
      } outside ${agentName}'s send scope. Every recipient of one message has to be inside a single grant. Drop ${
        blocked.length === 1 ? 'that address' : 'those addresses'
      }, or ask the person running Wren to widen the send scope in Settings → Agents.`
    }
    case 'no-recipients':
      return 'Wren refused request_send: the message has no recipients.'
    case 'revoked':
      return `Wren refused request_send: ${agentName} held the send capability and it was revoked. Ask the person running Wren to grant it again in Settings → Agents.`
    case 'agent-revoked':
      return `Wren refused request_send: ${agentName} has been revoked. Nothing will be accepted on this connection.`
    default:
      return `Wren refused request_send: ${agentName} does not hold the send capability. Ask the person running Wren to grant it in Settings → Agents. Drafting does not need it — draft_new and draft_reply still work.`
  }
}

// -- triage -------------------------------------------------------------------

/**
 * One clause per action, for the audit log. All eight in one table because
 * `archive_thread` and `modify_labels` are two doors onto the same eight
 * verbs, and a second table would be the same sentences free to drift.
 */
const ACTION_CLAUSE: Record<MailActionType, (subject: string) => string> = {
  archive: (s) => `Archived ${s}`,
  unarchive: (s) => `Moved ${s} back to the inbox`,
  trash: (s) => `Moved ${s} to the trash`,
  untrash: (s) => `Restored ${s} from the trash`,
  star: (s) => `Starred ${s}`,
  unstar: (s) => `Removed the star from ${s}`,
  markRead: (s) => `Marked ${s} as read`,
  markUnread: (s) => `Marked ${s} as unread`,
}

/**
 * The one audit line a triage call writes, naming every action in it.
 *
 * The thread is named once and is "it" afterwards, so two changes read as one
 * sentence: `Starred "X" and marked it as read.` Two rows for one call would
 * put the same tool call in the timeline twice.
 */
function triageSummary(actions: MailActionType[], subject: string): string {
  const clauses = actions.map((action, index) => {
    const clause = ACTION_CLAUSE[action](index === 0 ? quoteSubject(subject) : 'it')
    return index === 0 ? clause : clause[0].toLowerCase() + clause.slice(1)
  })
  return `${clauses.join(' and ')}.`
}

// -- archive_thread -----------------------------------------------------------

const archiveThread: ToolSpec = {
  capability: 'archiveLabel',
  tool: {
    name: 'archive_thread',
    title: 'Archive or trash a thread',
    description:
      'Move a thread out of the inbox, or back into it. archive removes it from the inbox and keeps it; trash moves it to the trash, where Gmail deletes it after 30 days. Both have an inverse here — unarchive and untrash — so nothing this tool does is permanent, and nothing it does is hidden: every call is written to Wren’s audit log.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_key: { type: 'string', description: 'The thread to move, from search_mail.' },
        action: {
          type: 'string',
          enum: [...ARCHIVE_ACTIONS],
          description:
            'archive takes it out of the inbox; unarchive puts it back; trash moves it to the trash; untrash restores it.',
        },
      },
      required: ['thread_key', 'action'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Archive or trash a thread',
      readOnlyHint: false,
      // trash is in here, and a thread in the trash is on a 30-day clock. The
      // honest hint is the one that makes a client ask.
      destructiveHint: true,
      // Archiving an archived thread changes nothing.
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async handler(ctx, args) {
    expectKeys('archive_thread', args, ['thread_key', 'action'])
    const key = requiredText(args, 'thread_key', 'archive_thread')
    const action = requiredEnum(args, 'action', 'archive_thread', ARCHIVE_ACTIONS)
    const { thread } = await requireThread(ctx, key)

    await ctx.mail.performAction({ type: action, threadKey: key })

    return {
      payload: { thread_key: key, action, subject: thread.subject, done: true },
      audit: { summary: triageSummary([action], thread.subject), threadKey: key },
    }
  },
}

// -- modify_labels ------------------------------------------------------------

/** `STARRED` + add → `star`, and the other three. */
function labelAction(label: string, adding: boolean): MailActionType {
  if (label === 'STARRED') return adding ? 'star' : 'unstar'
  return adding ? 'markUnread' : 'markRead'
}

function checkLabel(label: string): void {
  if ((MODIFIABLE_LABELS as readonly string[]).includes(label)) return
  if (label === 'INBOX' || label === 'TRASH') {
    throw new ToolRefusal(
      `${label} is moved with archive_thread, not modify_labels: use action archive, unarchive, trash or untrash.`,
    )
  }
  throw new ToolRefusal(
    `Wren cannot change the label “${label}” from an agent. modify_labels handles ${MODIFIABLE_LABELS.join(
      ' and ',
    )}; user labels are added in Wren by hand for now.`,
  )
}

const modifyLabels: ToolSpec = {
  capability: 'archiveLabel',
  tool: {
    name: 'modify_labels',
    title: 'Change a thread’s labels',
    description:
      'Add or remove labels on a thread. Wren handles STARRED and UNREAD from an agent: add STARRED to star it, remove UNREAD to mark it read, and so on. INBOX and TRASH belong to archive_thread, and user labels cannot be set from an agent yet. Both changes in one call are applied in order and written to the audit log as one line.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_key: { type: 'string', description: 'The thread to change, from search_mail.' },
        add: {
          type: 'array',
          items: { type: 'string', enum: [...MODIFIABLE_LABELS] },
          description: 'Labels to add. STARRED stars the thread; UNREAD marks it unread.',
        },
        remove: {
          type: 'array',
          items: { type: 'string', enum: [...MODIFIABLE_LABELS] },
          description: 'Labels to remove. STARRED unstars the thread; UNREAD marks it read.',
        },
      },
      required: ['thread_key'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Change a thread’s labels',
      readOnlyHint: false,
      // Starring and read state are cosmetic and reversible in one call.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async handler(ctx, args) {
    expectKeys('modify_labels', args, ['thread_key', 'add', 'remove'])
    const key = requiredText(args, 'thread_key', 'modify_labels')
    const add = uniqueLabels(args, 'add')
    const remove = uniqueLabels(args, 'remove')
    if (add.length === 0 && remove.length === 0) {
      throw new ToolRefusal('modify_labels needs at least one label in add or remove.')
    }
    const both = add.filter((label) => remove.includes(label))
    if (both.length > 0) {
      throw new ToolRefusal(
        `modify_labels was given ${both.join(', ')} in both add and remove. Pick one.`,
      )
    }
    for (const label of [...add, ...remove]) checkLabel(label)

    const { thread } = await requireThread(ctx, key)
    const actions = [
      ...add.map((label) => labelAction(label, true)),
      ...remove.map((label) => labelAction(label, false)),
    ]
    for (const action of actions) {
      await ctx.mail.performAction({ type: action, threadKey: key })
    }

    return {
      payload: { thread_key: key, subject: thread.subject, added: add, removed: remove, done: true },
      audit: { summary: triageSummary(actions, thread.subject), threadKey: key },
    }
  },
}

function uniqueLabels(args: Args, key: 'add' | 'remove'): string[] {
  const raw = args[key]
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    throw new ToolRefusal(`modify_labels needs ${key} as an array of label names.`)
  }
  return [...new Set((raw as string[]).map((label) => label.trim().toUpperCase()))]
}

export const WRITE_TOOLS: ToolSpec[] = [
  draftNew,
  draftReply,
  requestSend,
  archiveThread,
  modifyLabels,
]
