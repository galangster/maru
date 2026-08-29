// The triage morning, lived end to end — M4's gate.
//
// The map's one filmable story, run for real over the rig in
// `helpers/live-rig.ts`: a real socket, the real shim as a child process, the
// real MCP handshake, the real gateway over the store demo mode seeds. The
// agent wakes to a full inbox, surveys it, archives the noise its grant
// admits, stars what needs a human's eyes, drafts two real replies, asks to
// send them, and is refused the one recipient its scope does not admit. The
// human opens Wren to a tidy inbox, approves both sends, and the audit trail
// reads back as the whole morning in order.
//
// Run it on its own, with the trail printed, as the gate:
//
//   npx vitest run tests/triage-live.test.ts --reporter=verbose

import { describe, it, expect } from 'vitest'

import { DEMO_AGENT } from '../src/core/agents'
import {
  type Draft,
  printTrail,
  requestSend,
  trailSince,
  useLiveRig,
  type Rig,
} from './helpers/live-rig'

const APP_VERSION = '0.1.0-triage'
const BASE = Date.parse('2026-08-29T07:30:00Z')

// The fixture inbox, cast for the story. Noise the grant admits archiving,
// one thread worth a star, two threads worth a real reply, and one neighbour
// whose domain the send scope does not admit.
const NOISE = [
  'demo-personal/p-marginal', // a newsletter
  'demo-personal/p-signal', // a newsletter
  'demo-personal/p-gym', // a renewal notice
]
const STAR = 'demo-work/w-security'
const REPLIES = [
  {
    key: 'demo-work/w-latency',
    mode: 'replyAll',
    body: 'Persisting the index sounds right — **ship it** if it lands under a gigabyte.',
    html: '<strong>ship it</strong>',
  },
  {
    key: 'demo-work/w-design-review',
    mode: 'replyAll',
    body: 'Option B, with the account promoted to the header. It pays back the click.',
    html: 'Option B',
  },
] as const
const OUT_OF_SCOPE = 'demo-personal/p-neighbour' // Rosa, rosa@quillfield.example

const boot = useLiveRig()

async function inbox(client: Rig['client']): Promise<string[]> {
  const found = (await client.call('search_mail', { query: '', limit: 50 })) as {
    threads: { thread_key: string }[]
  }
  return found.threads.map((t) => t.thread_key)
}

// The rig binds a unix socket path; on Windows the app uses a named pipe
// through the Rust relay, which the windows-build workflow compiles. These
// two suites are the macOS/Linux arc.
describe.runIf(process.platform !== 'win32')('live triage morning: survey, archive, star, draft, refusal, approvals', () => {
  it('leaves a tidy inbox, two approved sends, one refusal, and a readable trail', async () => {
    const { client, gateway, mail } = await boot(BASE, APP_VERSION)

    // 1. Who am I, and what do I hold? The agent's first question.
    const ping = (await client.call('wren_ping')) as { capabilities: string[] }
    expect(ping.capabilities).toEqual(['read', 'draft', 'archiveLabel', 'send'])

    // 2. The accounts, then the morning's inbox.
    const accounts = await client.call('list_accounts')
    expect(JSON.stringify(accounts)).toContain('demo-work')

    const before = await inbox(client)
    // The set arithmetic below needs the whole inbox, not a page of it.
    expect(before.length).toBeLessThan(50)
    for (const key of [...NOISE, STAR, ...REPLIES.map((r) => r.key), OUT_OF_SCOPE]) {
      expect(before).toContain(key)
    }

    // 3. Noise out, under the archiveLabel grant. Summaries were enough; the
    //    agent never opened these.
    for (const key of NOISE) {
      const done = (await client.call('archive_thread', { thread_key: key, action: 'archive' })) as {
        done: boolean
      }
      expect(done.done).toBe(true)
    }

    // 4. One thread needs the human first, not a reply: star it.
    const starred = (await client.call('modify_labels', { thread_key: STAR, add: ['STARRED'] })) as {
      added: string[]
      done: boolean
    }
    expect(starred.added).toEqual(['STARRED'])

    // 5. The tidy inbox: exactly the archived threads gone, nothing else moved.
    const after = await inbox(client)
    const beforeKeys = new Set(before)
    const afterKeys = new Set(after)
    for (const key of NOISE) expect(afterKeys.has(key)).toBe(false)
    expect(afterKeys.size).toBe(beforeKeys.size - NOISE.length)
    for (const key of afterKeys) expect(beforeKeys.has(key)).toBe(true)

    // 6. Two real replies: read the thread, draft with the composer's own
    //    rules, ask to send. Nothing dispatches.
    const sentBefore = await mail.listThreads({ kind: 'unified', folder: 'sent' })
    const approvalIds: string[] = []
    for (const item of REPLIES) {
      const thread = (await client.call('read_thread', { thread_key: item.key })) as {
        messages: { body_text: string }[]
      }
      expect(thread.messages.length).toBeGreaterThan(0)

      const drafted = (await client.call('draft_reply', {
        thread_key: item.key,
        mode: item.mode,
        body_markdown: item.body,
      })) as { draft: Draft }
      expect(drafted.draft.subject).toMatch(/^Re: /)

      const requested = (await requestSend(client, drafted.draft)) as {
        approval_id: string
        status: string
      }
      expect(requested.status).toBe('pending')
      approvalIds.push(requested.approval_id)
    }
    expect(await mail.listThreads({ kind: 'unified', folder: 'sent' })).toHaveLength(
      sentBefore.length,
    )

    // 7. The refusal the trust model exists for: Rosa's domain is outside the
    //    send scope, so the whole message is refused, by name, and the agent
    //    is told which address failed rather than left to guess.
    const rosaThread = (await client.call('read_thread', { thread_key: OUT_OF_SCOPE })) as {
      messages: unknown[]
    }
    expect(rosaThread.messages.length).toBeGreaterThan(0)
    const rosaDraft = (await client.call('draft_reply', {
      thread_key: OUT_OF_SCOPE,
      mode: 'reply',
      body_markdown: 'Thank you! I will knock this evening.',
    })) as { draft: Draft }
    expect(rosaDraft.draft.to.map((a) => a.email)).toContain('rosa@quillfield.example')

    await expect(requestSend(client, rosaDraft.draft)).rejects.toThrow('rosa@quillfield.example')

    // 8. The agent's own view of the queue agrees with the gateway's.
    const seen = (await client.call('list_pending')) as {
      requests: { approval_id: string; status: string }[]
    }
    for (const id of approvalIds) {
      expect(seen.requests.find((r) => r.approval_id === id)?.status).toBe('pending')
    }
    const queued = await gateway.approvals.listPending()
    for (const id of approvalIds) expect(queued.map((a) => a.id)).toContain(id)

    // 9. The human's half: both approvals tapped in Wren. There is no tool for
    //    this, on purpose.
    for (const id of approvalIds) {
      const approved = await gateway.approvals.approve(id)
      expect(approved.status).toBe('approved')
    }

    // 10. Both replies went out, into the threads they answer.
    const sentAfter = await mail.listThreads({ kind: 'unified', folder: 'sent' })
    for (const item of REPLIES) {
      expect(sentAfter.map((t) => t.key)).toContain(item.key)
      const conversation = await mail.getThread(item.key)
      const outgoing = conversation.messages[conversation.messages.length - 1]
      expect(outgoing.subject).toMatch(/^Re: /)
      expect(outgoing.bodyHtml).toContain(item.html)
    }

    // 11. The whole morning, in order, in the one place the human reads it.
    const trail = await trailSince(gateway, DEMO_AGENT.id, BASE)
    expect(trail.map((row) => `${row.tool}:${row.outcome}`)).toEqual([
      'connected:ok',
      'initialize:ok',
      'wren_ping:ok',
      'list_accounts:ok',
      'search_mail:ok',
      'archive_thread:ok',
      'archive_thread:ok',
      'archive_thread:ok',
      'modify_labels:ok',
      'search_mail:ok',
      'read_thread:ok',
      'draft_reply:ok',
      'request_send:pending',
      'read_thread:ok',
      'draft_reply:ok',
      'request_send:pending',
      'read_thread:ok',
      'draft_reply:ok',
      'request_send:blocked',
      'list_pending:ok',
      'send:ok',
      'send:ok',
    ])

    printTrail('the triage morning, as the audit log tells it', trail)
  }, 30_000)
})
