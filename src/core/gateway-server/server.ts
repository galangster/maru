// The session manager — the app's half of the gateway.
//
// It owns exactly one decision the relay cannot make: whether a presented
// credential is an agent. Everything after that is bookkeeping, and everything
// before it is bytes.
//
// The connection discipline registry.ts asks for lives here, in four lines:
// `verifyCredential` is called once, per connection, on the first frame; the
// Agent it returns is handed to the session and held; no later frame can
// change it, because no later frame is ever read by this file.

import type { Agent, AgentGateway } from '../agents'
import type { MailService } from '../types'
import { parseFrame } from './frames'
import type { GatewayRelay } from './relay'
import { GatewaySession } from './session'

/**
 * Who a failed connection is attributed to.
 *
 * A token that does not resolve has no agent to hang the row on — and by
 * registry.ts's design it *cannot* have one, because a revoked agent and a
 * wrong token are deliberately indistinguishable here. The row still has to be
 * written: a process on this machine probing Maru with bad credentials is
 * exactly the thing an audit log exists to make visible. It lands under this
 * id, which matches no agent, so it appears in the timeline's "All" view and
 * under no agent's tab.
 */
export const UNKNOWN_CREDENTIAL_ID = 'unknown-credential'

export interface GatewayServerDeps {
  relay: GatewayRelay
  gateway: AgentGateway
  mail: MailService
  appVersion: string
  now?: () => number
}

/** What the shim sends first. Nothing else in the frame is read. */
function tokenOf(frame: string): string | null {
  const parsed = parseFrame(frame)
  if (parsed === null || typeof parsed !== 'object') return null
  const token = (parsed as { token?: unknown }).token
  return typeof token === 'string' ? token : null
}

const REJECTION =
  'Maru does not recognise this credential. Create an agent in Maru under Settings → Agents and use the credential it issues.'

export class GatewayServer {
  private readonly sessions = new Map<number, GatewaySession>()
  /**
   * Frames that arrived between the auth verdict and the session existing.
   *
   * A fast client sends `initialize` the instant its shim reports `auth_ok`,
   * and the accept path still has two awaits to go at that point. Buffering is
   * not an optimisation here — dropping that frame would hang the handshake.
   */
  private readonly pending = new Map<number, string[]>()
  private readonly unsubscribes: (() => void)[] = []
  private stopped = false

  private constructor(private readonly deps: GatewayServerDeps) {}

  static async start(deps: GatewayServerDeps): Promise<GatewayServer> {
    const server = new GatewayServer(deps)
    server.unsubscribes.push(
      await deps.relay.onAuth((event) => void server.handleAuth(event.connId, event.frame)),
      await deps.relay.onFrame((event) => server.handleFrame(event.connId, event.frame)),
      await deps.relay.onClose((event) => void server.handleClose(event.connId)),
    )
    return server
  }

  /** Live session count. The cap itself is enforced in Rust. */
  get sessionCount(): number {
    return this.sessions.size
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    for (const unsubscribe of this.unsubscribes) unsubscribe()
    this.unsubscribes.length = 0
    const open = [...this.sessions.values()]
    this.sessions.clear()
    this.pending.clear()
    await Promise.all(open.map((session) => session.close()))
  }

  private async handleAuth(connId: number, frame: string): Promise<void> {
    // Opened before the first await, so nothing this connection sends while
    // the credential is being checked can land on the floor.
    this.pending.set(connId, [])
    const token = tokenOf(frame)
    const agent = token === null ? null : await this.deps.gateway.registry.verifyCredential(token)

    if (!agent) {
      this.pending.delete(connId)
      await this.deps.gateway.audit.append({
        agentId: UNKNOWN_CREDENTIAL_ID,
        tool: 'auth_failed',
        summary:
          token === null
            ? 'A connection was refused: its first frame was not a credential.'
            : 'A connection was refused: the credential is not one Maru issued, or its agent is revoked.',
        outcome: 'blocked',
      })
      await this.deps.relay.authResult(connId, { accepted: false, message: REJECTION })
      return
    }

    await this.deps.gateway.noteConnection(agent)
    await this.deps.relay.authResult(connId, { accepted: true, agentId: agent.id })
    await this.openSession(connId, agent)
  }

  private async openSession(connId: number, agent: Agent): Promise<void> {
    const session = await GatewaySession.open({
      connId,
      agent,
      gateway: this.deps.gateway,
      mail: this.deps.mail,
      appVersion: this.deps.appVersion,
      now: this.deps.now ?? (() => Date.now()),
      link: {
        send: (encoded) => this.deps.relay.reply(connId, encoded),
        close: () => this.deps.relay.close(connId),
      },
    })
    if (this.stopped) {
      this.pending.delete(connId)
      await session.close()
      return
    }
    this.sessions.set(connId, session)
    const queued = this.pending.get(connId) ?? []
    this.pending.delete(connId)
    for (const frame of queued) session.deliver(frame)
  }

  private handleFrame(connId: number, frame: string): void {
    const session = this.sessions.get(connId)
    if (session) {
      session.deliver(frame)
      return
    }
    // Still authenticating. Anything for a connection that is neither open nor
    // authenticating belongs to a session that has already been torn down.
    this.pending.get(connId)?.push(frame)
  }

  private async handleClose(connId: number): Promise<void> {
    this.pending.delete(connId)
    const session = this.sessions.get(connId)
    if (!session) return
    this.sessions.delete(connId)
    session.handleDisconnect()
    await session.close()
  }
}
