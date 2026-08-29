// An MCP `Transport` over one relayed socket connection.
//
// The SDK's own transports all own their channel: StdioServerTransport reads
// process.stdin, the HTTP ones own a request. Wren's channel is owned by Rust
// and reaches the webview as events, so the transport is written inside-out —
// `send` pushes a frame at the relay, and `deliver` is called by the session
// manager when a frame arrives. Nothing in here knows what a credential is;
// authentication already happened before this object was constructed.

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

import { encodeFrame, FrameReader, parseFrame } from './frames'

/** Everything the transport needs from the connection it sits on. */
export interface FrameLink {
  /** Write one already-encoded frame, newline included. */
  send(frame: string): Promise<void>
  /** Ask the socket to close. Idempotent. */
  close(): Promise<void>
}

export class RelayTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  readonly sessionId: string

  private readonly reader = new FrameReader()
  private closed = false

  constructor(
    private readonly link: FrameLink,
    sessionId: string,
  ) {
    this.sessionId = sessionId
  }

  /**
   * A no-op that must still exist: `Server.connect` calls it, and callbacks
   * are installed before it runs. The socket was already open and already
   * authenticated by the time this object existed.
   */
  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) return
    try {
      await this.link.send(encodeFrame(message))
    } catch (cause) {
      this.fail(cause)
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      await this.link.close()
    } catch {
      // A close that fails because the peer already went away is the ordinary
      // case, not an error worth surfacing to the protocol layer.
    }
    this.onclose?.()
  }

  /**
   * One inbound frame from the relay.
   *
   * The relay's contract is one complete frame per call with the terminator
   * already stripped — gateway.rs owns the split, because the bytes arrive
   * there first. It is re-added here so that everything still passes through
   * FrameReader: the size cap then holds on both sides of the boundary (see
   * frames.ts), and a relay that ever batched two frames into one payload
   * would be handled rather than silently mangled.
   *
   * A frame that is not JSON, or is JSON that is not a JSON-RPC message, is
   * reported through `onerror` and dropped. It is not fatal: the SDK's own
   * stdio transport does the same, and one malformed line from a buggy client
   * should not take down a session that is otherwise working.
   */
  deliver(frame: string): void {
    if (this.closed) return
    const chunk = frame.endsWith('\n') ? frame : `${frame}\n`
    let lines: string[]
    try {
      lines = this.reader.push(chunk)
    } catch (cause) {
      this.fail(cause)
      void this.close()
      return
    }
    for (const line of lines) {
      const parsed = parseFrame(line)
      if (parsed === null || typeof parsed !== 'object') {
        this.fail(new Error('Received a frame that is not a JSON object.'))
        continue
      }
      this.onmessage?.(parsed as JSONRPCMessage)
    }
  }

  /** The socket went away. Distinct from `close`, which we initiated. */
  handleDisconnect(): void {
    if (this.closed) return
    this.closed = true
    this.onclose?.()
  }

  private fail(cause: unknown): void {
    this.onerror?.(cause instanceof Error ? cause : new Error(String(cause)))
  }
}
