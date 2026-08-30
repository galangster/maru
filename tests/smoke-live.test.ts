// The live smoke — M3's final gate, and the first test that leaves the process.
//
// Everything else in this suite drives objects. This one drives the product:
// the rig in `helpers/live-rig.ts` — a real unix socket, the real shim as a
// child process, the real MCP handshake, the real `GatewayServer` and
// `AgentGateway` over the store demo mode seeds, `DemoMailService` underneath.
// Only `src-tauri/src/gateway.rs` is stood in for; see the helper's header.
//
// The arc it asserts, connected end to end:
//
//   connect → search_mail → read_thread → draft_reply → request_send
//           → (a person approves in Wren) → sent → the audit trail says so
//
// Run it on its own, with output, as the gate:
//
//   npx vitest run tests/smoke-live.test.ts --reporter=verbose

import { describe, it, expect } from 'vitest'

import { DEMO_AGENT } from '../src/core/agents'
import {
  bootCore,
  printTrail,
  requestSend,
  spawnShim,
  stopCore,
  trailSince,
  useLiveRig,
  type Draft,
} from './helpers/live-rig'

const APP_VERSION = '0.1.0-smoke'
const BASE = Date.parse('2026-08-29T09:00:00Z')

const boot = useLiveRig()

// The rig binds a unix socket path; on Windows the app uses a named pipe
// through the Rust relay, which the windows-build workflow compiles. These
// two suites are the macOS/Linux arc.
describe.runIf(process.platform !== 'win32')('live smoke: shim, socket, tools, approval, send', () => {
  it('carries an agent from search to a sent message, and writes the arc down', async () => {
    const { client, gateway, mail } = await boot(BASE, APP_VERSION)

    // 1. The surface arrives over the socket.
    const listed = (await client.request('tools/list')).result as { tools: { name: string }[] }
    expect(listed.tools.map((t) => t.name)).toContain('request_send')

    // 2. search_mail — summaries only.
    const search = (await client.call('search_mail', { query: 'latency', limit: 5 })) as {
      threads: { thread_key: string; subject: string }[]
    }
    const hit = search.threads.find((t) => t.subject.includes('p95 latency'))
    expect(hit).toBeDefined()
    expect(JSON.stringify(search)).not.toContain('<p')

    // 3. read_thread — plain text, hydrated.
    const thread = (await client.call('read_thread', { thread_key: hit!.thread_key })) as {
      messages: { id: string; body_text: string }[]
    }
    expect(thread.messages.length).toBeGreaterThan(0)
    expect(thread.messages[0].body_text.length).toBeGreaterThan(0)

    // 4. draft_reply — the composer's own rules, nothing stored.
    const drafted = (await client.call('draft_reply', {
      thread_key: hit!.thread_key,
      mode: 'replyAll',
      body_markdown: 'Persisting the index sounds right. **Ship it** if it is under a gigabyte.',
    })) as { draft: Draft }
    expect(drafted.draft.subject).toMatch(/^Re: /)
    expect(drafted.draft.body_html).toContain('<strong>Ship it</strong>')

    // 5. request_send — queued for a human, dispatched to nobody.
    const sentBefore = await mail.listThreads({ kind: 'unified', folder: 'sent' })
    const requested = (await requestSend(client, drafted.draft)) as {
      approval_id: string
      status: string
    }
    expect(requested.status).toBe('pending')
    expect(await mail.listThreads({ kind: 'unified', folder: 'sent' })).toHaveLength(
      sentBefore.length,
    )

    // 6. The approval really landed in the queue — asked over the wire, and
    //    asked of the gateway itself.
    const seen = (await client.call('list_pending')) as {
      requests: { approval_id: string; status: string }[]
    }
    expect(seen.requests.find((r) => r.approval_id === requested.approval_id)?.status).toBe(
      'pending',
    )
    const queued = await gateway.approvals.listPending()
    expect(queued.map((a) => a.id)).toContain(requested.approval_id)

    // 7. A person approves it in Wren. There is no tool for this, on purpose.
    const approved = await gateway.approvals.approve(requested.approval_id)
    expect(approved.status).toBe('approved')

    // 8. It went out: the demo mailbox's Sent list carries it.
    const sentAfter = await mail.listThreads({ kind: 'unified', folder: 'sent' })
    expect(sentAfter.length).toBeGreaterThan(sentBefore.length)
    // A reply joins the thread it answers, so Sent gains that thread rather
    // than a new one titled "Re: …" — the same behaviour the composer has.
    expect(sentAfter.map((t) => t.key)).toContain(hit!.thread_key)
    const conversation = await mail.getThread(hit!.thread_key)
    const outgoing = conversation.messages[conversation.messages.length - 1]
    expect(outgoing.bodyHtml).toContain('<strong>Ship it</strong>')
    expect(outgoing.subject).toBe(drafted.draft.subject)

    // 9. The trail, connected, in order.
    const trail = await trailSince(gateway, DEMO_AGENT.id, BASE)
    expect(trail.map((row) => `${row.tool}:${row.outcome}`)).toEqual([
      'session.start:ok',
      'connected:ok',
      'initialize:ok',
      'search_mail:ok',
      'read_thread:ok',
      'draft_reply:ok',
      'request_send:pending',
      'list_pending:ok',
      'send:ok',
    ])

    printTrail('audit trail', trail)
  }, 30_000)

  it('refuses a credential Wren never issued, and the shim exits 4', async () => {
    const core = await bootCore(BASE, APP_VERSION)

    const child = spawnShim(core.socketPath, 'wren_agent_nope')
    const code = await new Promise<number>((resolve) => child.on('exit', (value) => resolve(value ?? -1)))
    expect(code).toBe(4)

    await stopCore(core)
  }, 30_000)
})
